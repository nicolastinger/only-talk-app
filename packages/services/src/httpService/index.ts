import { RustResponse, HttpStatusMap, TALK_API } from "@workspace/types";
import { invoke } from "@tauri-apps/api/core";

let base_url: string = TALK_API;

/** 设置运行时 API 基础地址(由 appConfig.initAppConfig 从客户端配置表加载后调用) */
export const setApiBase = (base: string) => {
  base_url = base;
};

/** 获取运行时 API 基础地址(未初始化时回退 TALK_API 默认值) */
export const getApiBase = (): string => base_url;

/**
 * 后端业务成功码：
 * - 200：成功且带数据（CommonResponse / CommonResponseRef::success）
 * - 204：成功但无数据（CommonResponseNoDataRef::success_empty）
 */
export const BACKEND_SUCCESS_CODES = [200, 204];

/** 判断后端统一信封的 code 是否表示业务成功 */
export const isBackendSuccess = (code?: number): boolean =>
  code !== undefined && BACKEND_SUCCESS_CODES.includes(code);

/** 判断 HTTP 状态码是否表示请求成功（200 带数据 / 204 无数据） */
export const isHttpSuccess = (status?: number): boolean =>
  status === 200 || status === 204;

export interface BackendEnvelope<T = unknown> {
  code: number;
  data: T;
  message?: string;
}

/** 本工程 DTO 字段校验专用错误码(HTTP 状态码与业务码一致) */
export const VALIDATION_ERROR_CODE = 604;

/** 校验错误条目: 对应后端 validator::ValidationErrors 序列化后的一项 */
export interface ValidationRuleError {
  code: string;
  message: string;
  params?: Record<string, unknown>;
}

/** 校验错误集合: 字段名 -> 规则错误列表 */
export type ValidationErrors = Record<string, ValidationRuleError[]>;

/** 判断响应是否为 DTO 字段校验错误(HTTP 状态 604 或业务码 604) */
export const isValidationError = (res: RustResponse): boolean => {
  if (res.res.status === VALIDATION_ERROR_CODE) return true;
  try {
    const body = JSON.parse(res.res.body) as { code?: number };
    return body?.code === VALIDATION_ERROR_CODE;
  } catch {
    return false;
  }
};

// ===== 统一 HTTP 错误中间层 =====

/** HTTP/业务错误分类 */
export type HttpErrorKind =
  | "network"
  | "validation" // 604: DTO 字段校验失败
  | "business" // 500 业务码: 业务处理失败
  | "unauthorized" // 401
  | "forbidden" // 403
  | "not_found" // 404
  | "unknown";

/** 统一归一化后的响应结果(中间层标准输出) */
export interface NormalizedResult<T = unknown> {
  ok: boolean;
  kind: HttpErrorKind;
  status?: number;
  data?: T;
  /** 单条错误信息(业务/网络/认证等) */
  message?: string;
  /** 604 校验错误: 逐条规则错误信息 */
  messages?: string[];
}

/** 平台统一错误展示器(由各端注册: PC antd message / mobile Vant toast) */
export interface HttpErrorHandler {
  show: (result: NormalizedResult) => void;
}

let httpErrorHandler: HttpErrorHandler | null = null;

/** 注册平台统一的 HTTP 错误展示器(应用启动时调用一次) */
export const setHttpErrorHandler = (handler: HttpErrorHandler | null) => {
  httpErrorHandler = handler;
};

/** 从 604 响应体提取规则错误(兼容信封 {code,data} 与裸校验对象两种形态) */
const extractValidationErrors = (
  res: RustResponse
): { errors: unknown; code: number | null } => {
  try {
    const body = JSON.parse(res.res.body) as BackendEnvelope &
      Record<string, unknown>;
    if (body && typeof body.code === "number") {
      return { errors: body.data, code: body.code };
    }
    return { errors: body, code: null };
  } catch {
    return { errors: null, code: null };
  }
};

/**
 * 将 invoke_rust 原始响应归一化为分类结果(纯函数, 不展示)。
 * 错误码分支: 604 = DTO 校验失败; 500 业务码 = 业务报错; 401/403/404 = HTTP 状态错误; 其余 unknown。
 */
export const normalizeRustResponse = <T = unknown>(
  res: RustResponse
): NormalizedResult<T> => {
  if (!res.netSuccess) {
    return { ok: false, kind: "network", message: res.error || "网络请求失败" };
  }
  const { status, body } = res.res;
  // HTTP 204 或空 body 的 200: 成功无数据
  if (status === 204 || (status === 200 && !body)) {
    return { ok: true, kind: "business", status };
  }
  const { errors, code } = extractValidationErrors(res);
  // 业务成功(HTTP 2xx 且业务码 200/204)
  if (
    status >= 200 &&
    status < 300 &&
    typeof code === "number" &&
    isBackendSuccess(code)
  ) {
    return { ok: true, kind: "business", status, data: errors as T };
  }
  // 604: DTO 字段校验失败(HTTP 状态 604 或业务码 604)
  if (status === VALIDATION_ERROR_CODE || code === VALIDATION_ERROR_CODE) {
    return {
      ok: false,
      kind: "validation",
      status,
      messages: parseValidationMessages(errors),
    };
  }
  // 有业务码但非成功: 500 业务报错(HTTP 可能 200/400/500)
  if (typeof code === "number" && body) {
    let message: string | undefined;
    try {
      message = (JSON.parse(body) as BackendEnvelope).message;
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      kind: "business",
      status,
      message: message || "业务处理失败",
    };
  }
  // HTTP 状态码分支
  switch (status) {
    case 401:
      return {
        ok: false,
        kind: "unauthorized",
        status,
        message: "未登录或登录已过期",
      };
    case 403:
      return { ok: false, kind: "forbidden", status, message: "无权限访问" };
    case 404:
      return {
        ok: false,
        kind: "not_found",
        status,
        message: "请求的资源不存在",
      };
    default:
      return {
        ok: false,
        kind: "unknown",
        status,
        message: HttpStatusMap.get(status) || `请求失败(${status})`,
      };
  }
};

/** 按错误分类统一展示(中间层唯一出口) */
export const showHttpError = (result: NormalizedResult): void => {
  if (!httpErrorHandler) return;
  httpErrorHandler.show(result);
};

/** 从校验错误对象(字段名 -> 规则错误列表)中逐条提取所有规则错误信息 */
export const parseValidationMessages = (errors: unknown): string[] => {
  if (!errors || typeof errors !== "object") return [];
  const messages: string[] = [];
  for (const fieldErrors of Object.values(errors as Record<string, unknown>)) {
    if (!Array.isArray(fieldErrors)) continue;
    for (const item of fieldErrors) {
      if (item && typeof item === "object" && "message" in item) {
        const msg = (item as { message?: unknown }).message;
        if (typeof msg === "string" && msg) {
          messages.push(msg);
        }
      }
    }
  }
  return messages;
};

/** 提取 604 校验错误对应的规则错误信息列表(逐条) */
export const getValidationMessages = (res: RustResponse): string[] => {
  try {
    const body = JSON.parse(res.res.body) as Record<string, unknown>;
    const errors = body?.code === VALIDATION_ERROR_CODE ? body.data : body;
    return parseValidationMessages(errors);
  } catch {
    return [];
  }
};

/**
 * 提取后端返回的错误信息:
 * - 604 校验错误: 逐条拼接所有字段规则错误信息(换行分隔)
 * - 其他: 优先取信封 message
 * - 兜底: fallback
 */
export const getBackendErrorMessage = (
  res: RustResponse,
  fallback: string
): string => {
  const messages = getValidationMessages(res);
  if (messages.length > 0) return messages.join("\n");
  try {
    const body = JSON.parse(res.res.body) as { message?: unknown };
    if (typeof body?.message === "string" && body.message) {
      return body.message;
    }
  } catch {
    /* 非 JSON 响应时使用兜底文案 */
  }
  return fallback;
};

/**
 * 解析 invoke_rust 的返回：先校验网络层，再按后端统一信封 code 判断业务成功(200/204)。
 * 成功返回 data；业务 204（success_empty）无数据，按布尔成功语义返回 true。
 * 604 校验错误抛出的 Error.message 为逐条拼接的字段规则错误信息。
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
  if (json.code === 204) {
    return true as T;
  }
  if (isBackendSuccess(json.code)) {
    return json.data as T;
  }
  const messages = getValidationMessages(res);
  if (messages.length > 0) {
    throw new Error(messages.join("\n"));
  }
  throw new Error(json.message || "请求失败");
};

/** 请求选项 */
export interface RequestOptions {
  /** 请求失败时是否由中间层自动展示错误(默认 true); 后台/静默请求可传 false */
  autoShowError?: boolean;
}

/**
 * 统一 HTTP 请求入口(所有接口均经此中间层):
 * 1. 网络请求
 * 2. 中间层归一化 + 错误码分支(604 校验/500 业务/401/403/404/网络等)
 * 3. 默认自动展示错误(可通过 options.autoShowError=false 关闭)
 * 返回原始 RustResponse, 供调用方继续按需处理(如 token 失效回退等)。
 */
export const invoke_rust = async (
  method: string,
  url: string,
  body: string,
  options?: RequestOptions
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
  }
  // 中间层: 归一化 + 错误码分支 + 统一展示
  const result = normalizeRustResponse(res);
  if (!result.ok && options?.autoShowError !== false) {
    showHttpError(result);
  }
  return res;
};
