/** 生成与 PC nanoid 兼容的消息唯一 ID（21 位） */
const CHARS =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-";

export const genNanoId = (): string =>
  Array.from(
    { length: 21 },
    () => CHARS[Math.floor(Math.random() * CHARS.length)]
  ).join("");
