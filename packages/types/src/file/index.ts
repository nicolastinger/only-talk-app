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

interface ImagePreview {
  imagePaths: string[];
  currentIndex?: number;
  title?: string;
}

export { BizFileInfo, BizChatFile, ImagePreview }