use std::panic::catch_unwind;
use image::DynamicImage;
use crate::models::CompressionConfig;

pub trait ImageEncoder: Send + Sync {
    fn encode(&self, img: &DynamicImage, config: &CompressionConfig) -> Result<Vec<u8>, String>;
}

/// PNG 編碼器：imagequant 向量調色盤量化 + oxipng 平行無損壓縮
pub struct PngEncoder;

impl ImageEncoder for PngEncoder {
    fn encode(&self, img: &DynamicImage, config: &CompressionConfig) -> Result<Vec<u8>, String> {
        let rgba = img.to_rgba8();
        let width = rgba.width();
        let height = rgba.height();

        // 若品質要求 100 則直接走 oxipng 無損壓縮
        if config.quality >= 100 {
            let mut raw_png = Vec::new();
            let encoder = image::codecs::png::PngEncoder::new(&mut raw_png);
            image::ImageEncoder::write_image(
                encoder,
                rgba.as_raw(),
                width,
                height,
                image::ExtendedColorType::Rgba8,
            )
            .map_err(|e| e.to_string())?;

        let opts = oxipng::Options::from_preset(2);
            return oxipng::optimize_from_memory(&raw_png, &opts)
                .map_err(|e| format!("oxipng error: {e}"));
        }

        // 8-bit 色彩向量量化 (imagequant)
        let mut liq = imagequant::new();
        let _ = liq.set_speed(4);
        let min_q = config.quality.saturating_sub(15).max(10);
        let _ = liq.set_quality(min_q, config.quality);

        let raw_pixels: Vec<imagequant::RGBA> = rgba
            .pixels()
            .map(|p| imagequant::RGBA {
                r: p[0],
                g: p[1],
                b: p[2],
                a: p[3],
            })
            .collect();

        let mut liq_img = liq
            .new_image(raw_pixels, width as usize, height as usize, 0.0)
            .map_err(|e| format!("imagequant new_image error: {e:?}"))?;

        let mut res = liq
            .quantize(&mut liq_img)
            .map_err(|e| format!("imagequant quantize error: {e:?}"))?;

        let _ = res.set_dithering_level(1.0);
        let (palette, pixels) = res
            .remapped(&mut liq_img)
            .map_err(|e| format!("imagequant remapping error: {e:?}"))?;

        // 構建帶調色盤 (PLTE + tRNS) 的 PNG 緩衝
        let mut raw_png = Vec::new();
        {
            let mut png_encoder = png::Encoder::new(&mut raw_png, width, height);
            png_encoder.set_color(png::ColorType::Indexed);
            png_encoder.set_depth(png::BitDepth::Eight);
            png_encoder.set_compression(png::Compression::Best);

            let mut plte = Vec::with_capacity(palette.len() * 3);
            let mut trns = Vec::with_capacity(palette.len());
            let mut has_transparency = false;

            for color in &palette {
                plte.push(color.r);
                plte.push(color.g);
                plte.push(color.b);
                trns.push(color.a);
                if color.a < 255 {
                    has_transparency = true;
                }
            }

            png_encoder.set_palette(plte);
            if has_transparency {
                png_encoder.set_trns(trns);
            }

            let mut writer = png_encoder
                .write_header()
                .map_err(|e| format!("png write_header error: {e}"))?;
            writer
                .write_image_data(&pixels)
                .map_err(|e| format!("png write_image_data error: {e}"))?;
        }

        // Oxipng 最佳化排程
        let opts = oxipng::Options::from_preset(2);
        oxipng::optimize_from_memory(&raw_png, &opts).map_err(|e| format!("oxipng error: {e}"))
    }
}

/// 快速感知啟發式分析：檢測圖片是否包含 UI、文字或高對比邊界
/// 耗時約 0.02ms，零記憶體分配
fn should_use_444_subsampling(raw_rgb: &[u8], width: usize, height: usize, quality: f32) -> bool {
    // 1. 若品質要求 >= 85，使用者優先追求保真度，直接啟用 4:4:4
    if quality >= 85.0 {
        return true;
    }

    // 2. 抽樣檢測：跨步取樣相鄰像素對，統計高對比邊界佔比
    let total_pixels = width * height;
    if total_pixels == 0 {
        return false;
    }

    let step = (total_pixels / 1500).max(1);
    let mut sharp_edge_count = 0usize;
    let mut sampled_count = 0usize;

    for i in (0..(total_pixels - 1)).step_by(step) {
        let idx1 = i * 3;
        let idx2 = (i + 1) * 3;
        if idx2 + 2 >= raw_rgb.len() {
            break;
        }

        let r1 = raw_rgb[idx1] as i32;
        let g1 = raw_rgb[idx1 + 1] as i32;
        let b1 = raw_rgb[idx1 + 2] as i32;

        let r2 = raw_rgb[idx2] as i32;
        let g2 = raw_rgb[idx2 + 1] as i32;
        let b2 = raw_rgb[idx2 + 2] as i32;

        let diff = (r1 - r2).abs() + (g1 - g2).abs() + (b1 - b2).abs();

        // 相鄰色差極大 (>= 160) 代表存在高對比邊界（如深底文字、向量圖示邊界）
        if diff >= 160 {
            sharp_edge_count += 1;
        }
        sampled_count += 1;
    }

    if sampled_count == 0 {
        return false;
    }

    let edge_ratio = (sharp_edge_count as f32) / (sampled_count as f32);
    // 高對比硬邊緣比例超過 3.5%，判定為 UI/文字/圖表，採用 4:4:4 保全文字銳利度
    edge_ratio > 0.035
}

/// JPEG 編碼器：MozJPEG Trellis 量化、Ahumada-Watson 感知量化矩陣與自適應 4:4:4/4:2:0 色度採樣
pub struct JpegEncoder;

impl ImageEncoder for JpegEncoder {
    fn encode(&self, img: &DynamicImage, config: &CompressionConfig) -> Result<Vec<u8>, String> {
        let rgb = img.to_rgb8();
        let width = rgb.width() as usize;
        let height = rgb.height() as usize;
        // JPEG 格式規格無純數學無損模式。若直接以 100% 量化矩陣壓縮，會造成係數極度冗餘、檔案反向膨脹數倍。
        // 當品質設定為 100 時，底層將 MozJPEG 鎖定在 95.0 感知天花板，配合 4:4:4 與 Ahumada-Watson 表，達成極限保真且杜絕膨脹。
        let quality = if config.quality >= 100 {
            95.0
        } else {
            config.quality as f32
        };
        let raw = rgb.as_raw();

        let use_444 = should_use_444_subsampling(raw, width, height, quality);

        let result = catch_unwind(std::panic::AssertUnwindSafe(|| {
            let mut comp = mozjpeg::Compress::new(mozjpeg::ColorSpace::JCS_RGB);
            comp.set_size(width, height);
            comp.set_quality(quality);
            comp.set_color_space(mozjpeg::ColorSpace::JCS_YCbCr);

            // 1. 色度採樣控制：UI/文字圖或品質 >= 85 採用 4:4:4，自然照片採用 4:2:0
            if use_444 {
                comp.set_chroma_sampling_pixel_sizes((1, 1), (1, 1));
            } else {
                comp.set_chroma_sampling_pixel_sizes((2, 2), (2, 2));
            }

            // 2. 注入 Ahumada-Watson 人眼感知量化矩陣（保護高頻亮度邊緣，抑制低頻色彩斷層）
            let luma_table = mozjpeg::qtable::AhumadaWatsonPeterson.scaled(quality, quality);
            let chroma_table = mozjpeg::qtable::AnnexK_Chroma.scaled(quality, quality);
            comp.set_luma_qtable(&luma_table);
            comp.set_chroma_qtable(&chroma_table);

            // 3. 純數學無失真優化：漸進式掃描與最佳化霍夫曼編碼樹
            comp.set_optimize_scans(true);
            comp.set_progressive_mode();
            let mut comp = comp.start_compress(Vec::new())?;

            let row_stride = width * 3;
            for row in 0..height {
                let start = row * row_stride;
                let end = start + row_stride;
                comp.write_scanlines(&raw[start..end])?;
            }

            comp.finish()
        }));

        match result {
            Ok(Ok(bytes)) => Ok(bytes),
            Ok(Err(e)) => Err(format!("MozJPEG encode error: {e:?}")),
            Err(_) => Err("MozJPEG crashed unexpectedly during compression".into()),
        }
    }
}

/// WebP 編碼器：libwebp 有損/無損動態預測
pub struct WebpEncoder;

impl ImageEncoder for WebpEncoder {
    fn encode(&self, img: &DynamicImage, config: &CompressionConfig) -> Result<Vec<u8>, String> {
        let rgba = img.to_rgba8();
        let width = rgba.width();
        let height = rgba.height();
        let quality = config.quality;

        let result = catch_unwind(std::panic::AssertUnwindSafe(|| {
            let encoder = webp::Encoder::from_rgba(rgba.as_raw(), width, height);
            let memory = if quality >= 100 {
                encoder.encode_lossless()
            } else {
                encoder.encode(quality as f32)
            };
            memory.to_vec()
        }));

        match result {
            Ok(bytes) => {
                if bytes.is_empty() {
                    Err("WebP 編碼器回傳空資料 (可能尺寸過大超過 16383px 或記憶體不足)".into())
                } else {
                    Ok(bytes)
                }
            }
            Err(_) => Err("WebP 編碼模組內部異常崩潰".into()),
        }
    }
}

/// AVIF 編碼器：ravif 原生 AV1 平衡檔位編碼
pub struct AvifEncoder;

impl ImageEncoder for AvifEncoder {
    fn encode(&self, img: &DynamicImage, config: &CompressionConfig) -> Result<Vec<u8>, String> {
        let rgba = img.to_rgba8();
        let width = rgba.width() as usize;
        let height = rgba.height() as usize;

        // 轉換為 ravif 接受之 ImgRef<RGBA8>
        let pixels: Vec<rgb::RGBA8> = rgba
            .pixels()
            .map(|p| rgb::RGBA8::new(p[0], p[1], p[2], p[3]))
            .collect();

        let img_ref = imgref::Img::new(&pixels[..], width, height);

        let encoder = ravif::Encoder::new()
            .with_quality(config.quality as f32)
            .with_speed(6);

        let encoded = encoder
            .encode_rgba(img_ref)
            .map_err(|e| format!("ravif encode error: {e}"))?;

        Ok(encoded.avif_file)
    }
}

/// 縮圖產生器：Fast Lane 快速解碼並縮放至 80x80，編碼為極輕量 WebP
pub fn generate_thumbnail(img: &DynamicImage) -> Result<Vec<u8>, String> {
    let thumb = img.thumbnail(80, 80);
    let rgba = thumb.to_rgba8();
    let encoder = webp::Encoder::from_rgba(rgba.as_raw(), rgba.width(), rgba.height());
    let memory = encoder.encode(70.0);
    Ok(memory.to_vec())
}

/// 依據目標格式選擇相應的編碼器
pub fn get_encoder(
    target_format: &str,
    original_ext: &str,
) -> (Box<dyn ImageEncoder>, &'static str, &'static str) {
    let resolved_format = if target_format == "original" {
        match original_ext.to_lowercase().as_str() {
            "png" => "png",
            "jpg" | "jpeg" => "jpeg",
            "webp" => "webp",
            "avif" => "avif",
            _ => "webp",
        }
    } else {
        target_format
    };

    match resolved_format {
        "png" => (Box::new(PngEncoder), "PNG", "png"),
        "jpeg" | "jpg" => (Box::new(JpegEncoder), "JPG", "jpg"),
        "webp" => (Box::new(WebpEncoder), "WEBP", "webp"),
        "avif" => (Box::new(AvifEncoder), "AVIF", "avif"),
        _ => (Box::new(WebpEncoder), "WEBP", "webp"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::RgbaImage;

    #[test]
    fn test_webp_roundtrip() {
        let mut img = RgbaImage::new(100, 100);
        for pixel in img.pixels_mut() {
            *pixel = image::Rgba([120, 200, 150, 255]);
        }
        let dynamic_img = DynamicImage::ImageRgba8(img);
        let config = CompressionConfig::default();
        let encoder = WebpEncoder;
        let bytes = encoder.encode(&dynamic_img, &config).expect("encode webp");
        assert!(!bytes.is_empty());

        let decoded = image::load_from_memory(&bytes).expect("decode webp");
        assert_eq!(decoded.width(), 100);
        assert_eq!(decoded.height(), 100);
    }
}
