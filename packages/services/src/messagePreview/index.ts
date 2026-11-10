/**
 * 会话列表 / 搜索结果的「最后一条消息」预览状态机。
 *
 * 后端 `chat_session.last_message` 存的是消息 raw, `text_type` 有三种来源:
 * - 本地实时消息: text_type 准确(1/2/3/21/2001…);
 * - `/session/list` 合并来的会话: 只有 `last_preview`(= 服务端 raw 文本), text_type 为 0;
 * - 历史脏数据: text_type 与 raw 可能已经对不上(例如会话被服务端预览覆盖但类型没更新)。
 *
 * 因此这里先按 raw 的 JSON 形状识别真实内容(单聊记录 / 群聊双层包装 / 媒体记录),
 * 识别不出来再按 text_type 兜底(通话控制、P2P 握手、系统通知等无结构消息),
 * 最后才回退到原始文本或「未知消息」。
 *
 * 消息类型常量对齐 `src-tauri/src/utils/message_types.rs`。
 */

/** 单聊文本 */
const MSG_TYPE_TEXT = 1;
/** 单聊图片 */
const MSG_TYPE_IMAGE = 2;
/** 单聊文件 */
const MSG_TYPE_FILE = 3;
/** P2P 连接初始化(隐私握手) */
const MSG_TYPE_P2P = 4;
/** P2P 视频呼叫(旧版) */
const MSG_TYPE_P2P_VIDEO_CALL = 5;
/** P2P 视频数据 */
const MSG_TYPE_P2P_VIDEO_DATA = 6;
/** P2P 视频配置 */
const MSG_TYPE_P2P_VIDEO_CONFIG = 7;
/** P2P 隐私聊天文本 */
const MSG_TYPE_P2P_TEXT = 8;
/** P2P 音频数据 */
const MSG_TYPE_P2P_AUDIO_DATA = 9;
/** P2P 媒体配置 */
const MSG_TYPE_P2P_MEDIA_CONFIG = 10;
/** P2P 媒体控制 */
const MSG_TYPE_P2P_MEDIA_CONTROL = 11;
/** 通话邀请 */
const MSG_TYPE_CALL_INVITE = 12;
/** 已接听通话 */
const MSG_TYPE_CALL_ACCEPT = 13;
/** 已拒绝通话 */
const MSG_TYPE_CALL_REJECT = 14;
/** 通话结束 */
const MSG_TYPE_CALL_END = 15;
/** P2P 媒体信息 */
const MSG_TYPE_P2P_MEDIA_INFO = 16;
/** P2P 文件数据 */
const MSG_TYPE_P2P_FILE_DATA = 17;
/** P2P 文件传输请求 */
const MSG_TYPE_P2P_FILE_REQUEST = 18;
/** P2P 文件传输响应 */
const MSG_TYPE_P2P_FILE_RESPONSE = 19;
/** P2P 媒体接收就绪 */
const MSG_TYPE_P2P_MEDIA_READY = 20;
/** 单聊语音 */
const MSG_TYPE_VOICE = 21;
/** 通用 JSON */
const MSG_TYPE_JSON = 88;
/** 心跳 */
const MSG_TYPE_PING = 99;
/** WebRTC 信令 */
const MSG_TYPE_WEBRTC_SIGNAL = 100;
/** P2P 首帧身份认证 */
const MSG_TYPE_P2P_AUTH = 101;
/** 接受 P2P 请求 */
const MSG_TYPE_P2P_ACCEPT = 103;
/** 拒绝 P2P 请求 */
const MSG_TYPE_P2P_REJECT = 104;
/** 消息投递成功回执 */
const MSG_TYPE_ACK_SUCCESS = 201;
/** 消息投递失败回执 */
const MSG_TYPE_ACK_FAILURE = 202;
/** 通知本机作为 P2P 服务端 */
const MSG_TYPE_P2P_USER_SERVER = 203;
/** 通知本机作为 P2P 客户端 */
const MSG_TYPE_P2P_USER_CLIENT = 204;
/** 通知消息 */
const MSG_TYPE_NOTIFY = 1024;
/** 系统消息 */
const MSG_TYPE_SYSTEM = 10001;
/** 强制下线 */
const MSG_TYPE_FORCE_LOGOUT = 10002;
/** TTL 续期 */
const MSG_TYPE_TTL = 10003;
/** 群文本 */
const MSG_TYPE_GROUP_TEXT = 2001;
/** 群图片 */
const MSG_TYPE_GROUP_IMAGE = 2002;
/** 群文件 */
const MSG_TYPE_GROUP_FILE = 2003;
/** 群通知 */
const MSG_TYPE_GROUP_NOTIFICATION = 2004;
/** 群消息已读回执 */
const MSG_TYPE_GROUP_READ = 2005;
/** 群语音 */
const MSG_TYPE_GROUP_VOICE = 2006;
/** 群消息投递成功回执 */
const MSG_TYPE_GROUP_ACK = 2201;
/** 单聊撤回控制消息 */
const MSG_TYPE_RECALL = 3001;

/** 预览渲染分类: 调用方可据此追加图标/样式，文本统一放在 `text` */
export type MessagePreviewKind =
  | 'text'
  | 'image'
  | 'file'
  | 'voice'
  | 'privacy'
  | 'p2p'
  | 'call'
  | 'notice'
  | 'recalled'
  | 'unknown';

export interface MessagePreview {
  /** 渲染分类 */
  kind: MessagePreviewKind;
  /** 最终展示文案(已翻译) */
  text: string;
}

/** 注入式翻译函数(桌面端/移动端各自传 `t`) */
export type MessagePreviewTranslate = (
  key: string,
  params?: Record<string, unknown>,
) => string;

type JsonObject = Record<string, unknown>;

/** 撤回载荷标记 key(与后端 service::recall 保持一致) */
const RECALL_MARKER = 'ot_recall';

const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'bmp',
  'heic',
  'heif',
  'avif',
  'svg',
]);

const tryParseJson = (raw: string): JsonObject | null => {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' ? (parsed as JsonObject) : null;
  } catch {
    return null;
  }
};

const readString = (obj: JsonObject | null, keys: string[]): string => {
  if (!obj) return '';
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

const looksLikeJson = (raw: string): boolean => {
  const trimmed = raw.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
};

/** 服务端预览可能来自 UTF-8 lossy 转换，含替换符说明不是可读文本 */
const hasGarbage = (raw: string): boolean => raw.includes('\uFFFD');

const basename = (path: string): string => {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || '';
};

const extensionOf = (fileName: string): string => {
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
};

/* ==================== 撤回 ==================== */

const parseRecallJson = (raw: string): string | null => {
  const obj = tryParseJson(raw);
  if (
    obj &&
    obj[RECALL_MARKER] === 1 &&
    typeof obj.target_nano_id === 'string'
  ) {
    return obj.target_nano_id;
  }
  return null;
};

/**
 * 判断是否为撤回控制消息并返回目标 nano_id。
 * - 单聊: type=3001, raw 即撤回载荷;
 * - 群聊: type=2001, raw 为外层 GroupTextRecord, 内层 text 为撤回载荷。
 */
export const parseRecallTarget = (
  textType: number,
  raw: string,
): string | null => {
  if (textType === MSG_TYPE_RECALL) return parseRecallJson(raw);
  if (textType === MSG_TYPE_GROUP_TEXT) {
    // 乐观上屏时 raw 为内层载荷; 落库/接收后为外层 GroupTextRecord
    const direct = parseRecallJson(raw);
    if (direct) return direct;
    const outer = tryParseJson(raw);
    const inner = typeof outer?.text === 'string' ? outer.text : '';
    return inner ? parseRecallJson(inner) : null;
  }
  return null;
};

/** 是否为撤回控制消息 */
export const isRecallMessage = (textType: number, raw: string): boolean =>
  parseRecallTarget(textType, raw) !== null;

/* ==================== raw 形状嗅探 ==================== */

interface SniffedContent {
  kind: 'text' | 'image' | 'file' | 'voice' | 'notice' | 'recalled';
  text?: string;
  fileName?: string;
}

/**
 * 按 raw 的 JSON 结构识别消息内容，兼容:
 * - 单聊记录: `{text,prev_id,platform}` / `{biz_id,file_name,img_*,duration,…}`
 * - 群聊包装: `{text:'<内层 raw>', send_user}`(可能再套一层)
 * - 通知: `{title, content}`
 */
const sniff = (raw: string, depth = 0): SniffedContent | null => {
  if (!raw || depth > 3) return null;
  const obj = tryParseJson(raw);
  if (!obj) return null;

  // 撤回载荷
  if (obj[RECALL_MARKER] === 1 && typeof obj.target_nano_id === 'string') {
    return { kind: 'recalled' };
  }

  // 群聊外层包装
  if (typeof obj.text === 'string' && typeof obj.send_user === 'string') {
    const nested = sniff(obj.text, depth + 1);
    if (nested) return nested;
    const text = obj.text.trim();
    return text ? { kind: 'text', text } : null;
  }

  // 单聊文本 / 群通知正文 / 通知正文
  const content = readString(obj, ['text', 'content']);
  if (content) return { kind: 'text', text: content };

  // 媒体记录(单聊单层 JSON / 群聊内层 JSON)
  if (typeof obj.biz_id === 'string') {
    const fileName = readString(obj, ['file_name']);
    if (obj.duration !== undefined) return { kind: 'voice' };
    if (
      obj.img_width !== undefined ||
      obj.img_height !== undefined ||
      obj.img_size !== undefined
    ) {
      return { kind: 'image' };
    }
    if (IMAGE_EXTENSIONS.has(extensionOf(fileName))) return { kind: 'image' };
    return { kind: 'file', fileName };
  }

  // 只有标题的通知
  const title = readString(obj, ['title']);
  if (title) return { kind: 'notice', text: title };

  return null;
};

/**
 * 服务端 `last_preview` 会被截断(256 字符)，长文本的 JSON 可能不完整。
 * 这里用正则直接从残缺 JSON 里抠出 `text` 字段，并对内层 JSON 再递归一次。
 */
const recoverTruncatedText = (raw: string, depth = 0): string => {
  if (depth > 2) return '';
  // 完整字段优先; 服务端截断时可能连右引号都没有, 退化为"取到结尾"
  const match =
    /"text"\s*:\s*"((?:\\.|[^"\\])*)"/.exec(raw) ??
    /"text"\s*:\s*"((?:\\.|[^"\\])*)$/.exec(raw);
  if (!match) return '';
  let value = match[1];
  try {
    const parsed: unknown = JSON.parse(`"${value}"`);
    if (typeof parsed === 'string') value = parsed;
  } catch {
    // 转义不完整时按原样使用
  }
  value = value.trim();
  if (value.startsWith('{')) {
    const inner = recoverTruncatedText(value, depth + 1);
    if (inner) return inner;
    const innerText = readString(tryParseJson(value), ['text', 'content']);
    return innerText.startsWith('{') ? '' : innerText;
  }
  return value;
};

/* ==================== 渲染 ==================== */

const renderSniffed = (
  content: SniffedContent,
  t: MessagePreviewTranslate,
): MessagePreview => {
  switch (content.kind) {
    case 'text':
      return { kind: 'text', text: content.text || t('chat.typeEmpty') };
    case 'image':
      return { kind: 'image', text: t('chat.typeImage') };
    case 'file':
      return content.fileName
        ? {
            kind: 'file',
            text: t('chat.typeFileWithName', { name: content.fileName }),
          }
        : { kind: 'file', text: t('chat.typeFile') };
    case 'voice':
      return { kind: 'voice', text: t('chat.typeVoice') };
    case 'notice':
      return { kind: 'notice', text: content.text || t('chat.typeNotice') };
    case 'recalled':
      return { kind: 'recalled', text: t('chat.recalled') };
  }
};

/** 类型未命中或 raw 形状不认识时的兜底 */
const unknownPreview = (
  raw: string,
  t: MessagePreviewTranslate,
): MessagePreview => {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: 'text', text: t('chat.typeEmpty') };
  if (looksLikeJson(trimmed)) {
    const recovered = recoverTruncatedText(trimmed);
    return recovered
      ? { kind: 'text', text: recovered }
      : { kind: 'unknown', text: t('chat.typeUnknown') };
  }
  if (hasGarbage(trimmed)) {
    return { kind: 'unknown', text: t('chat.typeUnknown') };
  }
  return { kind: 'text', text: trimmed };
};

const filePreview = (
  raw: string,
  t: MessagePreviewTranslate,
  name: string,
): MessagePreview => {
  const resolved = name || (!looksLikeJson(raw) ? basename(raw.trim()) : '');
  return resolved
    ? { kind: 'file', text: t('chat.typeFileWithName', { name: resolved }) }
    : { kind: 'file', text: t('chat.typeFile') };
};

const noticePreview = (
  raw: string,
  t: MessagePreviewTranslate,
  fallbackKey: string,
): MessagePreview => {
  const trimmed = raw.trim();
  if (trimmed && !looksLikeJson(trimmed) && !hasGarbage(trimmed)) {
    return { kind: 'notice', text: trimmed };
  }
  return { kind: 'notice', text: t(fallbackKey) };
};

/**
 * 解析会话列表 / 搜索结果里「最后一条消息」的展示文案。
 *
 * @param textType 消息类型(缺失/脏数据传 0 或 undefined, 会走 raw 嗅探)
 * @param raw      消息 raw(服务端 last_preview 也是它)
 * @param t        翻译函数
 */
export const resolveMessagePreview = (
  textType: number | undefined,
  raw: string | undefined,
  t: MessagePreviewTranslate,
): MessagePreview => {
  const type = typeof textType === 'number' ? textType : -1;
  const content = typeof raw === 'string' ? raw : '';

  // 1. 撤回(单聊 3001 / 群聊 2001 载荷)优先级最高
  if (isRecallMessage(type, content)) {
    return { kind: 'recalled', text: t('chat.recalled') };
  }

  // 2. raw 自带结构时以结构为准(可纠正 text_type 与实际内容不一致的脏数据)
  const sniffed = sniff(content);
  if (sniffed) return renderSniffed(sniffed, t);

  // 3. 结构不可识别 → 按 text_type 兜底
  switch (type) {
    case MSG_TYPE_TEXT:
    case MSG_TYPE_P2P_TEXT:
    case MSG_TYPE_GROUP_TEXT:
      return unknownPreview(content, t);

    case MSG_TYPE_IMAGE:
    case MSG_TYPE_GROUP_IMAGE:
      return { kind: 'image', text: t('chat.typeImage') };

    case MSG_TYPE_FILE:
    case MSG_TYPE_GROUP_FILE:
      return filePreview(content, t, '');

    case MSG_TYPE_VOICE:
    case MSG_TYPE_GROUP_VOICE:
      return { kind: 'voice', text: t('chat.typeVoice') };

    // P2P 连接初始化(隐私聊天握手)
    case MSG_TYPE_P2P:
      return { kind: 'privacy', text: t('chat.typePrivate') };

    // 通话(新版 12-15 / 旧版 5)
    case MSG_TYPE_P2P_VIDEO_CALL:
    case MSG_TYPE_CALL_INVITE:
      return { kind: 'call', text: t('chat.typeVideoCall') };
    case MSG_TYPE_CALL_ACCEPT:
      return { kind: 'call', text: t('chat.typeCallAccepted') };
    case MSG_TYPE_CALL_REJECT:
      return { kind: 'call', text: t('chat.typeCallRejected') };
    case MSG_TYPE_CALL_END:
      return { kind: 'call', text: t('chat.typeCallEnded') };
    case MSG_TYPE_WEBRTC_SIGNAL:
      return { kind: 'call', text: t('chat.typeCalling') };

    // P2P 传输/协商(不应进入会话列表, 兜底避免露出原始 JSON)
    case MSG_TYPE_P2P_VIDEO_DATA:
    case MSG_TYPE_P2P_VIDEO_CONFIG:
    case MSG_TYPE_P2P_AUDIO_DATA:
    case MSG_TYPE_P2P_MEDIA_CONFIG:
    case MSG_TYPE_P2P_MEDIA_CONTROL:
    case MSG_TYPE_P2P_MEDIA_INFO:
    case MSG_TYPE_P2P_FILE_DATA:
    case MSG_TYPE_P2P_FILE_REQUEST:
    case MSG_TYPE_P2P_FILE_RESPONSE:
    case MSG_TYPE_P2P_MEDIA_READY:
    case MSG_TYPE_P2P_AUTH:
    case MSG_TYPE_P2P_ACCEPT:
    case MSG_TYPE_P2P_REJECT:
    case MSG_TYPE_P2P_USER_SERVER:
    case MSG_TYPE_P2P_USER_CLIENT:
      return { kind: 'p2p', text: t('chat.typeP2P') };

    // 通知/系统
    case MSG_TYPE_GROUP_NOTIFICATION:
      return noticePreview(content, t, 'chat.typeGroupNotice');
    case MSG_TYPE_SYSTEM:
      return noticePreview(content, t, 'chat.typeSystem');
    case MSG_TYPE_NOTIFY:
      return noticePreview(content, t, 'chat.typeNotice');

    // 撤回控制消息(载荷异常时仍按撤回展示)
    case MSG_TYPE_RECALL:
      return { kind: 'recalled', text: t('chat.recalled') };

    // 心跳/回执/强制下线/TTL/通用 JSON 等控制消息不进入会话列表
    case MSG_TYPE_JSON:
    case MSG_TYPE_PING:
    case MSG_TYPE_ACK_SUCCESS:
    case MSG_TYPE_ACK_FAILURE:
    case MSG_TYPE_GROUP_ACK:
    case MSG_TYPE_GROUP_READ:
    case MSG_TYPE_FORCE_LOGOUT:
    case MSG_TYPE_TTL:
    default:
      return unknownPreview(content, t);
  }
};
