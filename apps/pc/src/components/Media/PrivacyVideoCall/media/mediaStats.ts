/**
 * 编码/解码帧吞吐计数器（诊断用），统计是否持续在收发数据。
 */
export interface ThroughputCounter {
  sentFrames: number;
  sentBytes: number;
  receivedFrames: number;
  receivedBytes: number;
  receivedKeyFrames: number;
  lastReportAt: number;
}

export const createThroughputCounter = (): ThroughputCounter => ({
  sentFrames: 0,
  sentBytes: 0,
  receivedFrames: 0,
  receivedBytes: 0,
  receivedKeyFrames: 0,
  lastReportAt: Date.now(),
});
