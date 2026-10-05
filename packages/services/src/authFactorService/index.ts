import {
  AuthFactorListVO,
  AuthFactorVO,
  ChangePasswordDTO,
  ChangePasswordSendCodeDTO,
  CreateAuthFactorDTO,
  DeleteAuthFactorDTO,
  HTTP_METHOD,
  RustResponse,
  SendAuthFactorCodeDTO,
} from "@workspace/types";
import { getApiBase, invoke_rust, parseBackendResponse } from "../httpService";

function parseData<T>(res: RustResponse): T {
  return parseBackendResponse<T>(res);
}

/** 发送二次认证因素绑定验证码 (当前仅 email) */
export const send_auth_factor_code = async (
  dto: SendAuthFactorCodeDTO
): Promise<boolean> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    getApiBase() + "/auth_factor/send_code",
    JSON.stringify(dto)
  );
  return parseData<boolean>(res);
};

/** 新增二次认证因素 (email 需验证码) */
export const create_auth_factor = async (
  dto: CreateAuthFactorDTO
): Promise<AuthFactorVO> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    getApiBase() + "/auth_factor/create",
    JSON.stringify(dto)
  );
  return parseData<AuthFactorVO>(res);
};

/** 当前用户的二次认证因素列表 */
export const list_auth_factors = async (): Promise<AuthFactorListVO> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    getApiBase() + "/auth_factor/list",
    ""
  );
  return parseData<AuthFactorListVO>(res);
};

/** 删除 (解绑) 二次认证因素 */
export const delete_auth_factor = async (id: number): Promise<boolean> => {
  const dto: DeleteAuthFactorDTO = { id };
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    getApiBase() + "/auth_factor/delete",
    JSON.stringify(dto)
  );
  return parseData<boolean>(res);
};

/** 修改密码: 向已绑定的二次认证因素发送验证码 */
export const change_password_send_code = async (
  dto: ChangePasswordSendCodeDTO
): Promise<boolean> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    getApiBase() + "/user/change_password/send_code",
    JSON.stringify(dto)
  );
  return parseData<boolean>(res);
};

/** 修改密码: 校验验证码并提交新密码 */
export const change_password = async (
  dto: ChangePasswordDTO
): Promise<boolean> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    getApiBase() + "/user/change_password",
    JSON.stringify(dto)
  );
  return parseData<boolean>(res);
};
