import { reactive, computed } from "vue";
import { kv_get, kv_set, kv_remove } from "@workspace/services";

const AUTH_KEY = "ui_auth_flag";

interface AuthState {
  isLoggedIn: boolean;
}

const state = reactive<AuthState>({
  isLoggedIn: false,
});

kv_get(AUTH_KEY)
  .then((flag) => {
    if (flag) state.isLoggedIn = true;
  })
  .catch(() => {});

export const useAuthStore = () => {
  const setLoggedIn = () => {
    state.isLoggedIn = true;
    kv_set(AUTH_KEY, "1").catch(() => {});
  };

  const clearAuth = () => {
    state.isLoggedIn = false;
    kv_remove(AUTH_KEY).catch(() => {});
  };

  const isLoggedIn = computed(() => state.isLoggedIn);

  return { state, isLoggedIn, setLoggedIn, clearAuth };
};
