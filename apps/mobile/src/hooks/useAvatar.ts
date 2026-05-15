import { ref } from "vue";
import { getFiles } from "@workspace/services";

const avatarCache = new Map<string, string | null>();
const pendingRequests = new Map<string, Promise<string | null>>();

export function useAvatar() {
  const loading = ref(false);

  const getAvatarUrl = async (
    icon: string | undefined | null
  ): Promise<string | null> => {
    if (!icon) return null;
    if (avatarCache.has(icon)) return avatarCache.get(icon)!;
    if (pendingRequests.has(icon)) return pendingRequests.get(icon)!;

    const promise = (async () => {
      loading.value = true;
      try {
        const files = await getFiles(icon);
        const url = files?.[0]?.tauri_file_path || null;
        avatarCache.set(icon, url);
        return url;
      } catch {
        return null;
      } finally {
        loading.value = false;
        pendingRequests.delete(icon);
      }
    })();

    pendingRequests.set(icon, promise);
    return promise;
  };

  return { getAvatarUrl, loading };
}
