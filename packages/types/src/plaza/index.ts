/** 交友广场用户卡片 */
interface PlazaUser {
  uuid: string;
  username?: string;
  icon?: string;
  info?: string;
  gender?: number;
  age?: number;
  address?: string;
  motto?: string;
  tags?: string[];
  /** 我是否已心动 */
  liked_by_me?: boolean;
}

/** 广场分页结果 */
interface PlazaListResult {
  total: number;
  list: PlazaUser[];
}

/** 我的广场资料 */
interface PlazaProfile {
  allow_discover: boolean;
  motto?: string;
  tags: string[];
}

/** 更新我的广场资料 */
interface PlazaUpdateProfileDTO {
  allow_discover?: boolean;
  motto?: string;
}

/** 更新我的广场标签 */
interface PlazaUpdateTagsDTO {
  tags: string[];
}

/** 广场列表应询参数 */
interface PlazaListQuery {
  gender?: number;
  age_min?: number;
  age_max?: number;
  /** 按标签筛选 */
  tag?: string;
}

/** 心动切换(为匹配打基础) */
interface PlazaCrushToggleDTO {
  target_uuid: string;
}

/** 心动切换结果 */
interface PlazaCrushResult {
  /** 是否达成互相心动(匹配) */
  matched: boolean;
}

export type {
  PlazaUser,
  PlazaListResult,
  PlazaProfile,
  PlazaUpdateProfileDTO,
  PlazaUpdateTagsDTO,
  PlazaListQuery,
  PlazaCrushToggleDTO,
  PlazaCrushResult,
};
