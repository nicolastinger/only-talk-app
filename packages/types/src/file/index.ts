interface BizFileInfo {
  biz_id?: string;
  origin_file_id?: string;
  file_id?: string
}

interface BizChatFile {
  uuid: string;
  biz_name: string;
  description?: string;
  biz_type: string;
  remark?: string;
  file_infos: BizFileInfo[];
}

export { BizFileInfo, BizChatFile }