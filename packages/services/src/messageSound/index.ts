import { CLIENT_CONFIG_KEYS } from "@workspace/types";
import { getConfig, setConfig } from "../appConfig";

/**
 * 消息提示音(来消息声音提醒)。
 *
 * - 开关持久化到公共库 client_config 的 `app.message_sound`(缺省开启), 与主题/语言同一套存储;
 * - 声音由 WebAudio 现场合成(两段上行短音), 不依赖音频资源文件;
 * - WebView 的自动播放策略要求先有用户手势, 启动时调用 `armMessageSound()`,
 *   在首次点击/按键/触摸时解锁 AudioContext, 之后任意时刻都能播放。
 */

let audioCtx: AudioContext | null = null;
let armed = false;
let lastPlayedAt = 0;

/** 同一时间窗内只播一次, 避免多条消息叠加成噪音 */
const PLAY_THROTTLE_MS = 800;

type MessageSoundListener = (enabled: boolean) => void;

/** 提示音开关的变更监听(设置页与顶栏静音按钮共享同一份配置, 任一处改动互相同步) */
const soundListeners = new Set<MessageSoundListener>();

const notifyMessageSoundChange = (enabled: boolean): void => {
  for (const listener of [...soundListeners]) {
    try {
      listener(enabled);
    } catch (e) {
      console.error("提示音开关监听执行失败:", e);
    }
  }
};

/** 订阅提示音开关变更, 返回取消订阅函数 */
export const subscribeMessageSoundChange = (
  listener: MessageSoundListener
): (() => void) => {
  soundListeners.add(listener);
  return () => {
    soundListeners.delete(listener);
  };
};

/** 当前是否开启消息提示音(缺省开启) */
export const isMessageSoundEnabled = (): boolean =>
  getConfig(CLIENT_CONFIG_KEYS.messageSound) !== "0";

/** 持久化消息提示音开关 */
export const setMessageSoundEnabled = async (
  enabled: boolean
): Promise<void> => {
  try {
    await setConfig(CLIENT_CONFIG_KEYS.messageSound, enabled ? "1" : "0");
    notifyMessageSoundChange(enabled);
  } catch (e) {
    console.error("保存消息提示音设置失败:", e);
  }
};

const getAudioContext = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  if (audioCtx) return audioCtx;
  const Ctor =
    window.AudioContext ??
    (
      window as unknown as {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;
  if (!Ctor) return null;
  try {
    audioCtx = new Ctor();
  } catch {
    audioCtx = null;
  }
  return audioCtx;
};

/** 在首次用户手势时解锁音频上下文(绕过自动播放限制) */
export const armMessageSound = (): void => {
  if (armed || typeof window === "undefined") return;
  armed = true;
  const unlock = () => {
    getAudioContext()
      ?.resume()
      .catch(() => {});
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
  window.addEventListener("touchstart", unlock, { passive: true });
};

/** 播放一次消息提示音(两段短促上行音, 共约 0.4s) */
export const playMessageSound = (): void => {
  const now = Date.now();
  if (now - lastPlayedAt < PLAY_THROTTLE_MS) return;
  lastPlayedAt = now;

  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  const startAt = ctx.currentTime + 0.01;
  const tone = (freq: number, offset: number, duration: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, startAt + offset);
    gain.gain.setValueAtTime(0.0001, startAt + offset);
    gain.gain.exponentialRampToValueAtTime(0.16, startAt + offset + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startAt + offset);
    osc.stop(startAt + offset + duration + 0.02);
  };

  tone(880, 0, 0.14);
  tone(1174.66, 0.12, 0.2);
};
