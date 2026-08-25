/** 动态卡片 */
interface MomentVo {
  uuid: string;
  author_uuid: string;
  username?: string;
  icon?: string;
  content: string;
  visibility: number;
  image_count: number;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  created_at: number;
  updated_at: number;
}

/** 动态分页结果 */
interface MomentListResult {
  total: number;
  list: MomentVo[];
}

/** 动态评论 */
interface MomentCommentVo {
  id: string;
  moment_uuid: string;
  author_uuid: string;
  username?: string;
  icon?: string;
  content: string;
  created_at: number;
}

/** 动态评论分页结果 */
interface MomentCommentListResult {
  total: number;
  list: MomentCommentVo[];
}

/** 发布动态 */
interface CreateMomentDTO {
  content: string;
  visibility: number;
  file_ids: string[];
}

/** 点赞切换 */
interface LikeToggleDTO {
  moment_uuid: string;
}

/** 发表评论 */
interface AddCommentDTO {
  moment_uuid: string;
  content: string;
}

/** 通用分页参数 */
interface PageReq {
  page_num: number;
  page_size: number;
}

export type {
  MomentVo,
  MomentListResult,
  MomentCommentVo,
  MomentCommentListResult,
  CreateMomentDTO,
  LikeToggleDTO,
  AddCommentDTO,
  PageReq,
};
