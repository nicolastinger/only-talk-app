import { ref } from "vue";
import { getFiles } from "@workspace/services";

const avatarCache = new Map<string, string | null>();

export function useAvatar() {
  const loading = ref(false);

  const getAvatarUrl = async (icon: string | undefined | null): Promise<string | null> => {
    if (!icon) return null;
    if (avatarCache.has(icon)) return avatarCache.get(icon)!;
    loading.value = true;
    try {
      const files = await getFiles(icon);
      const url = files?.[0]?.tauri_file_path || null;
      avatarCache.set(icon, url);
      return url;
    } catch {
      avatarCache.set(icon, null);
      return null;
    } finally {
      loading.value = false;
    }
  };

  return { getAvatarUrl, loading };
}
