// 聊天记录
import { Page } from '@/types/backend/index';
import { TextMsgRaw } from '@/types/user/common';

interface Record {
  text_msg_raw?: TextMsgRaw;
  page: Page;
}

export { Record };
