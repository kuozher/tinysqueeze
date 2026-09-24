export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function truncateFilename(filename: string, maxLen: number = 32): string {
  if (filename.length <= maxLen) return filename;
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex === -1) {
    return filename.slice(0, maxLen - 3) + "...";
  }
  const ext = filename.slice(dotIndex);
  const name = filename.slice(0, dotIndex);
  const charsToShow = maxLen - ext.length - 3;
  if (charsToShow <= 3) return filename.slice(0, maxLen - 3) + "...";
  const front = Math.ceil(charsToShow / 2);
  const back = Math.floor(charsToShow / 2);
  return `${name.slice(0, front)}...${name.slice(name.length - back)}${ext}`;
}
