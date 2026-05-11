import { reactive, computed } from "vue";
import type { UserInfo } from "@workspace/types";
import { get_cached_user_info, get_user_info_by_uuid } from "@workspace/services";
import { getMyUuid } from "@/utils/api";

interface UserState {
  info: UserInfo | null;
  avatarUrl: string | null;
  loading: boolean;
}

const state = reactive<UserState>({
  info: null,
  avatarUrl: null,
  loading: false,
});

export const DEFAULT_AVATAR =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iNTAiIGN5PSI1MCIgcj0iNTAiIGZpbGw9IiNFNUU3RUIiLz48Y2lyY2xlIGN4PSI1MCIgY3k9IjM2IiByPSIxNiIgZmlsbD0iIzlDQTNBRiIvPjxwYXRoIGQ9Ik0xOCA4MmMwLTE3LjY3MyAxNC4zMjctMzIgMzItMzJzMzIgMTQuMzI3IDMyIDMyIiBmaWxsPSIjOUNBM0FGIi8+PC9zdmc+";

export const useUserStore = () => {
  const loadUserInfo = async () => {
    if (state.loading) return;
    state.loading = true;
    try {
      const uuid = await getMyUuid();
      if (!uuid) return;

      let userInfo = await get_cached_user_info(uuid);
      if (!userInfo) {
        const result = await get_user_info_by_uuid(uuid) as any;
        userInfo = result?.data ?? result;
      }
      if (userInfo) {
        state.info = userInfo;
      }
    } catch (e) {
      console.error("加载用户信息失败:", e);
    } finally {
      state.loading = false;
    }
  };

  const setUserInfo = (info: UserInfo) => {
    state.info = { ...state.info, ...info };
  };

  const setAvatarUrl = (url: string | null) => {
    state.avatarUrl = url;
  };

  const userInfo = computed(() => state.info);
  const avatarUrl = computed(() => state.avatarUrl);
  const loading = computed(() => state.loading);

  return { state, loadUserInfo, setUserInfo, setAvatarUrl, userInfo, avatarUrl, loading };
};
