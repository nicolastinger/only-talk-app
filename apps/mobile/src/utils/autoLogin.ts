/**
 * 启动自动登录(移动端): 打开应用时用免登录列表中的第一个账号(最近使用)自动登录。
 *
 * 每次应用启动只尝试一次(进程级标记, 页面刷新即重置)。登录成功后再登出、
 * 被其他设备顶下线, 都不会再次自动登录, 避免用户"退不出去"。
 */
let attempted = false;

/** 本次应用启动是否已尝试过自动登录 */
export const hasTriedAutoLogin = (): boolean => attempted;

/** 标记本次启动已尝试过自动登录(登出/被踢下线时调用, 阻止自动登录回原账号) */
export const markAutoLoginTried = (): void => {
  attempted = true;
};
