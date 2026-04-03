import { UserInfo } from '@workspace/types';

export default (initialState: UserInfo) => {
  // 在这里按照初始化数据定义项目中的权限，统一管理
  // 参考文档 https://umijs.org/docs/max/access
  const canSeeAdmin = initialState && initialState.username !== 'dontHaveAccess';
  return {
    canSeeAdmin,
  };
};
