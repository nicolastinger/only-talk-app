// 聊天记录
import { TextMsgRaw } from '@/types/user/common';
import { Page } from '@/types/backend/index';

interface Record {
  text_msg_raw?: TextMsgRaw,
  page: Page
}

export {Record}