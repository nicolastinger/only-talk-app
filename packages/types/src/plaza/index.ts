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
}

export type {
  PlazaUser,
  PlazaListResult,
  PlazaProfile,
  PlazaUpdateProfileDTO,
  PlazaUpdateTagsDTO,
  PlazaListQuery,
};
