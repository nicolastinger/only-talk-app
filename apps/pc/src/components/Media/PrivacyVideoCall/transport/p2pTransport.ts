/**
 * P2P 传输层：封装所有 `invoke('send_p2p_*')` Tauri 命令，
 * 让上层（组件/编解码模块）不直接依赖 IPC 命令名与参数结构。
 */
import { invoke } from '@tauri-apps/api/core';

export const sendP2pMediaReady = (friendId: string) =>
  invoke('send_p2p_media_ready', { targetUuid: friendId });

export const sendP2pMediaConfig = (friendId: string, mediaConfig: string) =>
  invoke('send_p2p_media_config', { mediaConfig, uuid: friendId });

export const sendP2pAudioFrame = (friendId: string, payload: Uint8Array) =>
  invoke('send_p2p_audio_frame', payload);

export const sendP2pVideoFrame = (friendId: string, payload: Uint8Array) =>
  invoke('send_p2p_video_frame', payload);

export const sendP2pMediaInfo = (
  friendId: string,
  infoType: string,
  data: string,
) => invoke('send_p2p_media_info', { infoType, data, targetUuid: friendId });

export const sendP2pMediaControl = (
  friendId: string,
  controlType: string,
  enabled: boolean,
) =>
  invoke('send_p2p_media_control', {
    controlType,
    enabled,
    targetUuid: friendId,
  });

export const sendP2pVideoCallEnd = (friendId: string) =>
  invoke('send_p2p_video_call_end', { targetUuid: friendId });

export const closeP2pConnection = (friendId: string) =>
  invoke('close_p2p_connection', { targetUuid: friendId });

export const sendP2pVideoCallInvite = (
  friendId: string,
  fromName: string | null,
) => invoke('send_p2p_video_call_invite', { targetUuid: friendId, fromName });

export const sendP2pVideoCallResponse = (
  friendId: string,
  opts: {
    accept: boolean;
    mediaConfig: string | null;
    rejectReason: string | null;
  },
) => invoke('send_p2p_video_call_response', { targetUuid: friendId, ...opts });
