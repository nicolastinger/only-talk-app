import { RustResponse, HttpStatusMap, TALK_API } from "@workspace/types";
import { invoke } from "@tauri-apps/api/core";

export interface NotificationService {
  error: (options: {
    key: string;
    message: string;
    description: string;
    duration: number | null;
  }) => void;
}

let notificationService: NotificationService | null = null;

export const setNotificationService = (service: NotificationService) => {
  notificationService = service;
};

const base_url: string = TALK_API;

/**
 * 后端业务成功码：
 * - 200：成功且带数据（CommonResponse / CommonResponseRef::success）
 * - 204：成功但无数据（CommonResponseNoDataRef::success_empty）
 */
export const BACKEND_SUCCESS_CODES = [200, 204];

/** 判断后端统一信封的 code 是否表示业务成功 */
export const isBackendSuccess = (code?: number): boolean =>
  code !== undefined && BACKEND_SUCCESS_CODES.includes(code);

export interface BackendEnvelope<T = unknown> {
  code: number;
  data: T;
  message?: string;
}

/**
 * 解析 invoke_rust 的返回：先校验网络层，再按后端统一信封 code 判断业务成功(200/204)。
 * 成功返回 data，失败抛出后端 message。
 */
export const parseBackendResponse = <T>(res: RustResponse): T => {
  if (!res.netSuccess) {
    throw new Error(res.error || "网络请求失败");
  }
  const body = res.res.body;
  // 兼容真·HTTP 204 空响应体：视为成功但无数据
  if (!body) {
    return undefined as T;
  }
  const json = JSON.parse(body) as BackendEnvelope<T>;
  if (isBackendSuccess(json.code)) {
    return json.data as T;
  }
  throw new Error(json.message || "请求失败");
};

export const invoke_rust = async (
  method: string,
  url: string,
  body: string
): Promise<RustResponse> => {
  if (!url.includes(base_url)) {
    url = base_url + url;
  }
  let res: RustResponse = {
    netSuccess: false,
    error: "",
    res: {
      status: 500,
      body: "",
    },
  };
  try {
    if (method === "get_request") {
      res.res = await invoke(method, { url });
    } else {
      res.res = await invoke(method, { url, body });
    }
    res.netSuccess = true;
    if (res.res.status !== 200 && res.res.status !== 204) {
      res.error = HttpStatusMap.get(res.res.status);
    }
  } catch (e) {
    console.log("网络请求失败", e);
    res.error = JSON.stringify(e);
    if (notificationService) {
      notificationService.error({
        key: "request_status",
        message: "请求失败,请检查网络",
        description: `错误信息: ${res.error || "未知错误"}`,
        duration: null,
      });
    }
  }
  return res;
};
