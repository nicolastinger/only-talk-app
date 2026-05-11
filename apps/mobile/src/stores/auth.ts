import { reactive, computed } from "vue";

interface AuthState {
  isLoggedIn: boolean;
}

const state = reactive<AuthState>({
  isLoggedIn: !!sessionStorage.getItem("auth_flag"),
});

export const useAuthStore = () => {
  const setLoggedIn = () => {
    state.isLoggedIn = true;
    sessionStorage.setItem("auth_flag", "1");
  };

  const clearAuth = () => {
    state.isLoggedIn = false;
    sessionStorage.removeItem("auth_flag");
  };

  const isLoggedIn = computed(() => state.isLoggedIn);

  return { state, isLoggedIn, setLoggedIn, clearAuth };
};
