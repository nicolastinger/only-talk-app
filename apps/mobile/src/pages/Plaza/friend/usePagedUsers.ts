import { ref } from "vue";
import type { PlazaListResult } from "@workspace/types";

type Fetcher = (page: number) => Promise<PlazaListResult>;

export function usePagedUsers(fetcher: Fetcher) {
  const list = ref<PlazaListResult["list"]>([]);
  const page = ref(1);
  const total = ref(0);
  const loading = ref(false);
  const finished = ref(false);

  const loadMore = async () => {
    if (loading.value || finished.value) return;
    loading.value = true;
    try {
      const result = await fetcher(page.value);
      total.value = result.total;
      list.value = list.value.concat(result.list);
      page.value += 1;
      if (list.value.length >= total.value) finished.value = true;
    } catch (e) {
      console.error("加载广场用户失败", e);
    } finally {
      loading.value = false;
    }
  };

  const refresh = async () => {
    page.value = 1;
    list.value = [];
    total.value = 0;
    finished.value = false;
    await loadMore();
  };

  return { list, total, loading, finished, loadMore, refresh };
}
