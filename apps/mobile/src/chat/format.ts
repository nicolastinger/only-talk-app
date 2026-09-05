/** 文件展示辅助（对齐 PC ChatFile.less 逻辑） */

export const formatFileSize = (bytes: number): string => {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

export const getFileTypeColor = (fileType?: string): string => {
  if (!fileType) return "#8c8c8c";
  const type = fileType.toLowerCase();
  if (["doc", "docx", "pdf", "txt", "xls", "xlsx", "ppt", "pptx"].includes(type)) {
    return "#1890ff";
  }
  if (["zip", "rar", "7z", "tar", "gz"].includes(type)) {
    return "#fa8c16";
  }
  if (
    ["js", "ts", "jsx", "tsx", "html", "css", "json", "py", "java", "rs", "go"].includes(
      type
    )
  ) {
    return "#52c41a";
  }
  return "#8c8c8c";
};

/** 完整时间（气泡悬浮时间/长按展示），格式 MM-DD HH:mm 或 YYYY-MM-DD HH:mm */
export const formatFullTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const hm = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (now.getFullYear() === date.getFullYear()) {
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${hm}`;
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${hm}`;
};
