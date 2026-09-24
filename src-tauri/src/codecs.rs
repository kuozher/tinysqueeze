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

/// JPEG 編碼器：MozJPEG Trellis 量化與感知優化 (包裝 FFI catch_unwind 防護)
pub struct JpegEncoder;

impl ImageEncoder for JpegEncoder {
    fn encode(&self, img: &DynamicImage, config: &CompressionConfig) -> Result<Vec<u8>, String> {
        let rgb = img.to_rgb8();
        let width = rgb.width() as usize;
        let height = rgb.height() as usize;
        let quality = config.quality as f32;

        let result = catch_unwind(std::panic::AssertUnwindSafe(|| {
            let mut comp = mozjpeg::Compress::new(mozjpeg::ColorSpace::JCS_RGB);
            comp.set_size(width, height);
            comp.set_quality(quality);
            comp.set_color_space(mozjpeg::ColorSpace::JCS_YCbCr);
            let mut comp = comp.start_compress(Vec::new())?;

            let raw = rgb.as_raw();
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

        let encoder = webp::Encoder::from_rgba(rgba.as_raw(), width, height);
        let memory = encoder.encode(config.quality as f32);
        Ok(memory.to_vec())
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
