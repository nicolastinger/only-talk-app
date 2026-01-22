import { Page } from './page';
import { TextMsgRaw } from '../user/common';

interface Record {
  text_msg_raw?: TextMsgRaw;
  page: Page;
}

export { Record };