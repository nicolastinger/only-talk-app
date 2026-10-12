/**
 * S3 服务端管理 API 返回载荷(仅镜像 rs s3_service / s3_controller, 应用侧不消费)
 */

/** POST /file/s3/objects/list — ListObjectsResult */
interface ListObjectsResult {
  objects: ObjectInfo[];
  common_prefixes: string[];
  is_truncated: boolean;
  next_continuation_token?: string;
}

/** 对象信息 — rs ObjectInfo */
interface ObjectInfo {
  key: string;
  /** 字节 */
  size: number;
  last_modified?: string;
  etag?: string;
  storage_class?: string;
}

/** GET /file/s3/objects/{key}/metadata — ObjectMetadata */
interface ObjectMetadata {
  key: string;
  /** 字节 */
  size: number;
  content_type?: string;
  last_modified?: string;
  etag?: string;
  metadata: Record<string, string>;
}

/** POST /file/s3/objects/delete_batch — DeleteBatchResult */
interface DeleteBatchResult {
  deleted: string[];
  failed: DeleteError[];
}

/** 删除失败项 — rs DeleteError */
interface DeleteError {
  key: string;
  code: string;
  message: string;
}

/** GET /file/s3/buckets — Vec<BucketInfo> */
interface BucketInfo {
  name: string;
  created?: string;
}

/** POST /file/s3/presign/download|upload — PresignedUrlResponse */
interface PresignedUrlResponse {
  url: string;
  key: string;
  expires_seconds: number;
}

export type {
  ListObjectsResult,
  ObjectInfo,
  ObjectMetadata,
  DeleteBatchResult,
  DeleteError,
  BucketInfo,
  PresignedUrlResponse,
};
