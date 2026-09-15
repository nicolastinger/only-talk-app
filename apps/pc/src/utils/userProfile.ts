import { SYSTEM_ACCOUNT } from '@/constants';
import { useBearStore } from '@/store/store';
import { history } from '@umijs/max';

/**
 * 打开用户资料卡：
 * - 自己的 uuid → 打开当前用户资料弹窗
 * - 其他用户（好友 / 群成员）→ 跳转到好友资料页
 */
export const openUserProfile = (uuid: string) => {
  if (!uuid || uuid === SYSTEM_ACCOUNT) return;

  const { userInfo, openUserInfoModal } = useBearStore.getState();
  if (userInfo?.uuid && uuid === userInfo.uuid) {
    openUserInfoModal();
    return;
  }

  history.push('/home/contacts/friend?friendId=' + uuid);
};
