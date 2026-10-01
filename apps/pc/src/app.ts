// 运行时配置

// 全局初始化数据配置，用于 Layout 用户信息和权限初始化
// 更多信息见文档：https://umijs.org/docs/api/runtime-config#getinitialstate

// 导入路由守卫工具函数和类
import { setLocale } from '@umijs/max';
import {
  getAppLanguage,
  initAppConfig,
  setHttpErrorHandler,
} from '@workspace/services';
import { message } from 'antd';
import { handleRouteChange, RouteInfo } from './utils/routeGuard';

// 注册统一 HTTP 错误中间层展示器(所有 http 接口的 604/500/401/403/404 等错误都在此统一展示)
setHttpErrorHandler({
  show: (result) => {
    if (result.kind === 'validation' && result.messages?.length) {
      // 604 DTO 校验失败: 逐条输出字段规则错误
      result.messages.forEach((msg) => message.error(msg));
      return;
    }
    message.error(result.message || '请求失败');
  },
});

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
