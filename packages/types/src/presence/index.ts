/**
 * 用户手动状态(presence)。
 *
 * 语义: 手动状态/签名(忙碌 / 离开 / 学习中 / 奋斗中 / 自定义文案), 与在线离线无关。
 * 服务端只存 Redis(`USER:PRESENCE:{UUID}`, 48 小时 TTL), 不落库; 仅好友可见。
 */

/** 状态枚举: online 表示"无状态/已清除" */
type PresenceMode =
  | "online"
  | "busy"
  | "away"
  | "studying"
  | "working"
  | "custom";

/** 单个用户的手动状态(镜像 http_service PresenceVO) */
interface PresenceVO {
  mode: PresenceMode;
  /** 自定义文案(仅 mode=custom) */
  text?: string | null;
  /** 过期时间(毫秒时间戳), 0 表示无状态 */
  expires_at: number;
}

/** 批量查询结果: uuid -> 状态(仅好友且当前有状态时出现) */
type FriendPresenceMap = Record<string, PresenceVO>;

export type { PresenceMode, PresenceVO, FriendPresenceMap };
