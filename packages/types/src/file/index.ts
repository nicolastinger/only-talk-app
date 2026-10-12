interface BizFileInfo {
  biz_id?: string;
  origin_file_id?: string;
  file_id?: string;
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

/** 本地文件管理分类（与 src-tauri service::file_service 对齐） */
type FileType = "image" | "video" | "audio" | "document" | "archive" | "other";

/** 本地文件管理列表项（file_record 表 status=0 且物理文件存在） */
interface LocalFileVo {
  id: number;
  biz_id: string;
  uuid: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  created_at: number;
  file_type: FileType;
  ext: string;
}

export type { BizFileInfo, BizChatFile, ImagePreview, LocalFileVo, FileType };
