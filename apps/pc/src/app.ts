// 运行时配置

// 全局初始化数据配置，用于 Layout 用户信息和权限初始化
// 更多信息见文档：https://umijs.org/docs/api/runtime-config#getinitialstate

// 导入路由守卫工具函数和类
import { setLocale } from '@umijs/max';
import { getAppLanguage, initAppConfig } from '@workspace/services';
import { handleRouteChange, RouteInfo } from './utils/routeGuard';

// 路由守卫函数 - 监听每一次路由跳转
// 这里只负责调用，具体逻辑封装在 routeGuard.ts 中
export const onRouteChange = (info: RouteInfo) => {
  handleRouteChange(info);
};

// 全局初始化数据
export async function getInitialState() {
  // 加载客户端配置(公共库 client_config 表 → 内存): 设置 API base / 默认主题 / 默认语言
  await initAppConfig();
  setLocale(getAppLanguage(), false);
  return {
    // 初始化状态
  };
}