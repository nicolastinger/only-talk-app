import { ChatMessage } from '@workspace/types';
import {
  isRecallMessage,
  parseRecallTarget,
} from '@workspace/services';

/** 单聊撤回控制消息类型（对齐后端 MSG_TYPE_RECALL） */
export const MSG_TYPE_RECALL = 3001;

export { isRecallMessage, parseRecallTarget };

/** 是否为撤回控制消息（ChatMessage） */
export const isRecallChatMessage = (msg: ChatMessage): boolean =>
  isRecallMessage(msg.text_msg_raw.text_type, msg.text_msg_raw.raw);
