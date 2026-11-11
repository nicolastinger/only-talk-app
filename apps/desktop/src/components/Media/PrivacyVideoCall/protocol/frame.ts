/**
 * MediaData 通道帧协议：24 字节帧头封装/解析（纯函数）
 */
import { FRAME_HEADER_SIZE } from '../lib/config';

/** 帧标志位：bit0 = 关键帧 */
export const FRAME_FLAG_KEY = 1;
/** 帧标志位：bit1 = 解码器配置帧 */
export const FRAME_FLAG_CONFIG = 2;

export interface ParsedFrameHeader {
  timestamp: number;
  duration: number;
  dataLen: number;
  flags: number;
}

/** 解析 24 字节帧头；数据不足时返回 null */
export const parseFrameHeader = (
  payload: Uint8Array,
): ParsedFrameHeader | null => {
  if (payload.length < FRAME_HEADER_SIZE) return null;
  const view = new DataView(
    payload.buffer,
    payload.byteOffset,
    FRAME_HEADER_SIZE,
  );
  return {
    timestamp: Number(view.getBigUint64(0, false)),
    duration: Number(view.getBigUint64(8, false)),
    dataLen: view.getUint32(16, false),
    flags: view.getUint32(20, false),
  };
};

/** 分配并写入帧头，返回预留 dataLen 字节数据区的完整帧（数据区由调用方填充） */
export const createFrame = (
  dataLen: number,
  opts: { timestamp?: number; duration?: number; flags?: number } = {},
): Uint8Array => {
  const payload = new Uint8Array(FRAME_HEADER_SIZE + dataLen);
  const view = new DataView(payload.buffer);
  view.setBigUint64(0, BigInt(opts.timestamp ?? 0), false);
  view.setBigUint64(8, BigInt(opts.duration ?? 0), false);
  view.setUint32(16, dataLen, false);
  view.setUint32(20, opts.flags ?? 0, false);
  return payload;
};
