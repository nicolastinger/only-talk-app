/**
 * WebCodecs MediaStreamTrackProcessor 全局类型补充声明。
 *
 * TS 5.9 的 lib.dom 尚未收录 MediaStreamTrackProcessor，
 * 这里声明为全局类型，供 PrivacyVideoCall 各 codec 模块共享。
 */

interface MediaStreamTrackProcessorLike {
  readonly readable: ReadableStream<VideoFrame>;
}

interface AudioStreamTrackProcessorLike {
  readonly readable: ReadableStream<AudioData>;
}

declare const MediaStreamTrackProcessor: {
  prototype: MediaStreamTrackProcessorLike;
  new (init: { track: MediaStreamTrack }): MediaStreamTrackProcessorLike;
};
