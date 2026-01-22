// 运行时配置

// 全局初始化数据配置，用于 Layout 用户信息和权限初始化
// 更多信息见文档：https://umijs.org/docs/api/runtime-config#getinitialstate

// 导入路由守卫工具函数和类型
import { handleRouteChange, RouteInfo } from './utils/routeGuard';

// 路由守卫函数 - 监听每一次路由跳转
// 这里只负责调用，具体逻辑封装在routerGuard.ts中
export const onRouteChange = (info: RouteInfo) => {
  handleRouteChange(info);
};

// 全局初始化数据
export async function getInitialState() {
  // 这里可以初始化全局数据
  // 例如：从本地存储或API获取用户信息
  return {
    // 初始化状态
  };
};
