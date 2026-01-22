interface VideoConfig {
  width: number;
  height: number;
  fps: number;
  audio: boolean;
  video: boolean;
  encode: string;
  bitrate: number;
}

export { VideoConfig };