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
  followed_by_me?: boolean;
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

/** 动态点赞用户 */
interface MomentLikerVo {
  uuid: string;
  username?: string;
  icon?: string;
  created_at: number;
}

/** 动态点赞分页结果 */
interface MomentLikerListResult {
  total: number;
  list: MomentLikerVo[];
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

/** 关注切换 */
interface FollowToggleDTO {
  target_user_uuid: string;
}

/** 发表评论 */
interface AddCommentDTO {
  moment_uuid: string;
  content: string;
}

/** 动态列表应询参数 */
interface MomentListQuery {
  /** 按作者过滤(仅公开+自己可见) */
  author_uuid?: string;
  /** 动态流类型: plaza-广场, following-关注, mine-我的 */
  feed?: string;
}

/** 动态点赞列表应询参数 */
interface LikeListQuery {
  moment_uuid: string;
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
  MomentLikerVo,
  MomentLikerListResult,
  CreateMomentDTO,
  LikeToggleDTO,
  FollowToggleDTO,
  AddCommentDTO,
  MomentListQuery,
  LikeListQuery,
  PageReq,
};
