import { Page } from "./page";
import { TextQuicMsgVo } from "./chat";

interface Record {
  text_msg_raw?: TextQuicMsgVo;
  page: Page;
}

export type { Record };
