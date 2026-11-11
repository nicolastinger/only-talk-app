import {
  ForgotPasswordResetRequest,
  ForgotPasswordSendCodeRequest,
  HTTP_METHOD,
  RustResponse,
} from "@workspace/types";
import { getApiBase, invoke_rust, parseBackendResponse } from "../httpService";

function parseData<T>(res: RustResponse): T {
  return parseBackendResponse<T>(res);
}

/** 忘记密码(未登录): 向已绑定的二次认证因素(当前仅 email)发送找回验证码 */
export const forgot_password_send_code = async (
  dto: ForgotPasswordSendCodeRequest
): Promise<boolean> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    getApiBase() + "/user/forgot_password/send_code",
    JSON.stringify(dto)
  );
  return parseData<boolean>(res);
};

/** 忘记密码(未登录): 校验验证码并提交新密码 */
export const forgot_password_reset = async (
  dto: ForgotPasswordResetRequest
): Promise<boolean> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    getApiBase() + "/user/forgot_password/reset",
    JSON.stringify(dto)
  );
  return parseData<boolean>(res);
};
