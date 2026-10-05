/** 二次认证因素类型 */
export const AuthFactorType = {
  EMAIL: 0,
  PHONE: 1,
  OTHER: 2,
} as const;

export type AuthFactorTypeValue =
  (typeof AuthFactorType)[keyof typeof AuthFactorType];

/** 二次认证因素状态 */
export const AuthFactorStatus = {
  DISABLED: 0,
  NORMAL: 1,
  UNBOUND: 2,
} as const;

export type AuthFactorStatusValue =
  (typeof AuthFactorStatus)[keyof typeof AuthFactorStatus];

/** 二次认证因素 (镜像 rs AuthFactorVO) */
export interface AuthFactorVO {
  id: number;
  user_id: string;
  /** 因素类型: 0=email 1=phone 2=other */
  factor_type: number;
  factor_value: string;
  verified: boolean;
  enabled: boolean;
  is_primary: boolean;
  /** 因素状态: 0=禁用 1=正常 2=已解绑 */
  status: number;
  /** 验证通过时间 (Unix 毫秒) */
  verified_at: number | null;
  /** 最近使用时间 (Unix 毫秒) */
  last_used_at: number | null;
  created_at: number;
  updated_at: number;
}

/** 二次认证因素列表 */
export interface AuthFactorListVO {
  total: number;
  list: AuthFactorVO[];
}

/** 发送二次认证因素绑定验证码 (当前仅 email) */
export interface SendAuthFactorCodeDTO {
  /** 因素类型: 0=email 1=phone 2=other */
  factor_type: number;
  factor_value: string;
}

/** 新增二次认证因素 (email 需邮箱验证码) */
export interface CreateAuthFactorDTO {
  factor_type: number;
  factor_value: string;
  verification_code?: string;
}

/** 删除 (解绑) 二次认证因素 */
export interface DeleteAuthFactorDTO {
  id: number;
}

/** 修改密码: 发送验证码请求 (由客户端决定渠道 factor_type) */
export interface ChangePasswordSendCodeDTO {
  /** 认证因素类型: 0=email 1=phone 2=other */
  factor_type: number;
}

/** 修改密码请求 (校验验证码后写入新密码) */
export interface ChangePasswordDTO {
  /** 认证因素类型: 0=email 1=phone 2=other */
  factor_type: number;
  verification_code: string;
  new_password: string;
}
