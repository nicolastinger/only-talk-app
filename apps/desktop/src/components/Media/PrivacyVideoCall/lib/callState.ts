/**
 * 通话生命周期状态机阶段定义
 */
export type CallPhase =
  | 'Idle'
  | 'Calling'
  | 'Ringing'
  | 'Connecting'
  | 'InCall'
  | 'Restarting'
  | 'Ended';
