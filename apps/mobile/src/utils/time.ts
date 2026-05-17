export function formatMessageTime(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);

  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth();
  const nowDay = now.getDate();

  const msgYear = date.getFullYear();
  const msgMonth = date.getMonth();
  const msgDay = date.getDate();

  const isToday =
    nowYear === msgYear && nowMonth === msgMonth && nowDay === msgDay;

  const yesterday = new Date(now);
  yesterday.setDate(nowDay - 1);
  const isYesterday =
    msgYear === yesterday.getFullYear() &&
    msgMonth === yesterday.getMonth() &&
    msgDay === yesterday.getDate();

  const timeStr = `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;

  if (isToday) return timeStr;

  if (isYesterday) return "昨天";

  if (nowYear === msgYear) {
    return `${String(msgMonth + 1).padStart(2, "0")}/${String(msgDay).padStart(
      2,
      "0"
    )}`;
  }

  return `${msgYear}/${String(msgMonth + 1).padStart(2, "0")}/${String(
    msgDay
  ).padStart(2, "0")}`;
}

export function getMessagePreview(
  text_type: number,
  lastMessage: string
): string {
  switch (text_type) {
    case 1:
      try {
        const parsed = JSON.parse(lastMessage);
        return parsed.text || lastMessage;
      } catch {
        return lastMessage;
      }
    case 2:
      return "[图片]";
    case 3:
      return "[文件]";
    case 4:
      return "[隐私模式]";
    case 5:
      return "[视频通话]";
    case 12:
    case 13:
    case 14:
    case 15:
      return "[通话]";
    case 100:
      return "[WebRTC信令]";
    default:
      return lastMessage || "";
  }
}
