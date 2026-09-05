import { getMessageDisplayText } from "@/chat/messageParse";

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
  return getMessageDisplayText(text_type, lastMessage);
}

/** 动态/广场时间展示（入参为秒时间戳） */
export function formatMomentTime(timestampSeconds?: number): string {
  if (!timestampSeconds) return "";
  const date = new Date(timestampSeconds * 1000);
  const now = new Date();

  const startToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const startDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  ).getTime();
  const dayDiff = Math.floor((startToday - startDate) / (24 * 60 * 60 * 1000));
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000);

  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  if (dayDiff === 0) {
    const diffHour = Math.floor(diffMin / 60);
    return `${diffHour} 小时前`;
  }
  if (dayDiff === 1) return "昨天";
  if (dayDiff > 1 && dayDiff < 7) return `${dayDiff} 天前`;

  const sameYear = now.getFullYear() === date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  if (sameYear) return `${mm}-${dd}`;
  return `${date.getFullYear()}-${mm}-${dd}`;
}
