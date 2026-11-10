import { invoke } from "@tauri-apps/api/core";
import type { Page, TextQuicMsgVo } from "@workspace/types";

/**
 * 聊天记录（历史消息）多维度检索。
 *
 * 对应 src-tauri 命令 `search_chat_record`：
 * - 单聊：`conversationId` 传对方 uuid；
 * - 群聊：`conversationId` 传群 uuid，`isGroup = true`；
 * - 结果按时间倒序返回（最新在前），分页用 page.current / page.size。
 */
export interface ChatHistoryQuery {
  conversationId: string;
  isGroup: boolean;
  page?: Page;
  /** 开始时间（毫秒，含） */
  startTime?: number;
  /** 结束时间（毫秒，含） */
  endTime?: number;
  /** 只看某个发送者（群聊按成员、单聊按我方/对方） */
  sendUser?: string;
  /** 消息类型过滤，空数组/省略 = 全部 */
  textTypes?: number[];
  /** 内容关键词（raw 模糊匹配） */
  keyword?: string;
}

export const DEFAULT_CHAT_HISTORY_PAGE_SIZE = 30;

export const searchChatRecord = async (
  query: ChatHistoryQuery
): Promise<TextQuicMsgVo[]> => {
  const keyword = query.keyword?.trim();
  return invoke<TextQuicMsgVo[]>("search_chat_record", {
    conversationId: query.conversationId,
    isGroup: query.isGroup,
    startTime: query.startTime ?? null,
    endTime: query.endTime ?? null,
    sendUser: query.sendUser || null,
    textTypes:
      query.textTypes && query.textTypes.length > 0 ? query.textTypes : null,
    keyword: keyword ? keyword : null,
    page: query.page ?? {
      size: DEFAULT_CHAT_HISTORY_PAGE_SIZE,
      current: 1,
      total: 0,
    },
  });
};
