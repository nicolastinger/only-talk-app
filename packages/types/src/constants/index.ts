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
} as const;

/** 客户端配置项 */
export interface ClientConfigItem {
  key: string;
  value: string;
}

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
]);
