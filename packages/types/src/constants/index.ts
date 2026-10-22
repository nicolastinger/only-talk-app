/**
 * HTTP API 基础地址的兜底默认值(prod)。
 * 实际运行时地址由客户端公共库 client_config 表的 `server.api_base` 决定(dev 自动 http://127.0.0.1:8443),
 * 启动后经 appConfig.initAppConfig() 写入内存, 请用 httpService 的 getApiBase() 获取。
 */
export const TALK_API = "https://onlytalk.cn";

/** 客户端配置键(公共库 client_config 表) */
export const CLIENT_CONFIG_KEYS = {
  serverApiBase: "server.api_base",
  serverDomain: "server.domain",
  appTheme: "app.theme",
  appLanguage: "app.language",
  messageSound: "app.message_sound",
  doNotDisturb: "app.do_not_disturb",
  autoDownloadWifi: "app.auto_download_wifi",
  autoDownloadCellular: "app.auto_download_cellular",
} as const;

/** 客户端配置项 */
export interface ClientConfigItem {
  key: string;
  value: string;
}

/**
 * 上传大小上限(字节), 与后端 src-tauri/src/utils/global_static_str.rs 保持一致。
 * 前端在发送前预校验并提示, 后端仍会二次校验。
 */
export const UPLOAD_LIMITS = {
  image: 100 * 1024 * 1024,
  file: 500 * 1024 * 1024,
} as const;

/**
 * 官网地址与法务页面(与 apps/web 的路由保持一致)。
 * 客户端"用户协议/隐私协议"入口统一指向官网页面, 不内置正文。
 */
export const OFFICIAL_SITE_URL = "https://www.onlytalk.cn";
/** 隐私协议页面 */
export const PRIVACY_POLICY_URL = `${OFFICIAL_SITE_URL}/privacy`;
/** 用户使用协议页面 */
export const USER_AGREEMENT_URL = `${OFFICIAL_SITE_URL}/agreement`;

export const HTTP_METHOD = {
  GET: "get_request",
  POST: "post_request",
  PUT: "put_request",
  DELETE: "delete_request",
};

export const HttpStatusMap: Map<number, string> = new Map([
  [200, "OK"],
  [400, "Bad Request"],
  [401, "Unauthorized"],
  [403, "Forbidden"],
  [404, "Not Found"],
  [500, "Internal Server Error"],
  [604, "DTO Validation Failed"],
]);
