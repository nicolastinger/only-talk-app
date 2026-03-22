// 路由守卫工具函数

/**
 * 路由位置信息接口
 */
export interface RouteLocation {
  pathname: string;
  search: string;
  hash: string;
  query?: Record<string, any>;
  params?: Record<string, string>;
}

/**
 * 路由配置项接口
 */
export interface RouteConfig {
  path?: string;
  name?: string;
  component?: string;
  routes?: RouteConfig[];
  exact?: boolean;
  [key: string]: any;
}

/**
 * 路由动作类型
 */
export type RouteAction = 'POP' | 'PUSH' | 'REPLACE';

/**
 * 路由信息接口
 */
export interface RouteInfo {
  location: RouteLocation;
  routes: RouteConfig[];
  action: RouteAction;
  basename?: string;
}

/**
 * 处理路由跳转逻辑
 * @param routeInfo 路由信息
 */
export const handleRouteChange = (routeInfo: RouteInfo) => {
  const { location, routes, action } = routeInfo;

  // 只在非开发环境或路由真正变化时记录日志
  if (process.env.NODE_ENV !== 'development' || action === 'PUSH') {
    console.log('路由跳转:', {
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
      action: action,
      timestamp: new Date().toISOString(),
    });
  }

  // 可以在这里添加权限验证逻辑
  // 例如：检查用户是否登录，是否有权限访问当前路由

  /* 示例：简单的登录验证
  const publicRoutes = ['/signIn', '/access'];
  const isPublicRoute = publicRoutes.some(route => 
    location.pathname.startsWith(route)
  );
  
  // 这里只是示例，实际应用中应该从localStorage或全局状态中获取登录状态
  const isLoggedIn = localStorage.getItem('userToken');
  
  // 如果不是公共路由且未登录，可以重定向到登录页面
  if (!isPublicRoute && !isLoggedIn && location.pathname !== '/signIn') {
    // 注意：在UmiJS中，建议使用history对象进行跳转
    // 这里只是演示逻辑，实际实现需要根据项目配置调整
    console.log('需要登录才能访问该页面');
    
    // 实际的跳转逻辑可以在这里实现
    // 例如：使用 Umi 的 history 对象
    // history.push('/signIn');
  }
  */
};

/**
 * 权限类型定义
 */
export type Permission = string;

/**
 * 用户权限接口
 */
export interface UserPermissions {
  permissions: Permission[];
  roles?: string[];
}

/**
 * 检查用户是否有权限访问指定路由
 * @param routePath 路由路径
 * @param userPermissions 用户权限列表或权限对象
 * @returns 是否有权限访问
 */
export const checkPermission = (
  routePath: string,
  userPermissions: Permission[] | UserPermissions,
): boolean => {
  // 将可能的UserPermissions对象转换为权限数组
  const permissions = Array.isArray(userPermissions)
    ? userPermissions
    : userPermissions.permissions;

  // 这里可以实现更复杂的权限验证逻辑
  // 例如：根据路由路径和用户权限列表进行匹配
  return true; // 默认允许访问
};
