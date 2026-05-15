import { reactive, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import type { UserInfo, HttpResponse, ResponseData } from "@workspace/types";
import { TALK_API } from "@workspace/types";
import { get_cached_user_info, cache_user_info } from "@workspace/services";
import { getMyUuid } from "@/utils/api";

interface UserState {
  info: UserInfo | null;
  loading: boolean;
}

const state = reactive<UserState>({
  info: null,
  loading: false,
});

export const DEFAULT_AVATAR =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iNTAiIGN5PSI1MCIgcj0iNTAiIGZpbGw9IiNFNUU3RUIiLz48Y2lyY2xlIGN4PSI1MCIgY3k9IjM2IiByPSIxNiIgZmlsbD0iIzlDQTNBRiIvPjxwYXRoIGQ9Ik0xOCA4MmMwLTE3LjY3MyAxNC4zMjctMzIgMzItMzJzMzIgMTQuMzI3IDMyIDMyIiBmaWxsPSIjOUNBM0FGIi8+PC9zdmc+";

async function fetchUserFromServer(): Promise<UserInfo | null> {
  try {
    const res: HttpResponse = await invoke("post_request", {
      url: TALK_API + "/user/me",
      body: "",
    });
    const data: ResponseData = JSON.parse(res.body);
    if (data.code === 200 && data.data) {
      const remote: UserInfo = data.data;
      const cached = await get_cached_user_info(remote.uuid).catch(() => null);
      const isDifferent =
        !cached || JSON.stringify(cached) !== JSON.stringify(remote);
      if (isDifferent) {
        await cache_user_info(remote).catch(() => {});
      }
      return remote;
    }
    return null;
  } catch {
    return null;
  }
}

export const useUserStore = () => {
  const loadUserInfo = async () => {
    if (state.loading) return;
    state.loading = true;
    try {
      const uuid = await getMyUuid().catch(() => null);
      if (!uuid) return;

      let userInfo: UserInfo | null = null;

      try {
        const me: string = await invoke("get_user_map", { key: "me" });
        if (me) {
          const cached: UserInfo = JSON.parse(me);
          if (cached.uuid === uuid) {
            userInfo = cached;
          }
        }
      } catch {}

      if (!userInfo) {
        userInfo = await get_cached_user_info(uuid).catch(() => null);
      }

      if (!userInfo) {
        userInfo = await fetchUserFromServer();
      }

      if (userInfo) {
        state.info = userInfo;
        invoke("add_user_map", {
          map: { me: JSON.stringify(userInfo) },
        }).catch(() => {});
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

  const userInfo = computed(() => state.info);
  const loading = computed(() => state.loading);

  return { state, loadUserInfo, setUserInfo, userInfo, loading };
};
