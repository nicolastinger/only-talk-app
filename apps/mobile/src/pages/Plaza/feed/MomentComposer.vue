<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { showToast, showLoadingToast, closeToast } from "vant";
import { invoke } from "@tauri-apps/api/core";
import {
  selectFile,
  convertPathToTauriUrl,
  create_moment,
} from "@workspace/services";
import { TALK_API } from "@workspace/types";
import { resolveContentToTempFile } from "@/utils/tempImage";

const router = useRouter();

const PAGE_MAX_IMAGES = 9;

const content = ref("");
const visibility = ref<number>(0);
const fileIds = ref<string[]>([]);
const previews = ref<string[]>([]);
const uploading = ref(false);
const publishing = ref(false);
let uploadCancelled = false;

const canPublish = ref(false);

const onContentInput = (e: Event) => {
  content.value = (e.target as HTMLTextAreaElement).value;
  canPublish.value = !!content.value.trim();
};

const back = () => {
  if (uploading.value) {
    uploadCancelled = true;
    closeToast();
    uploading.value = false;
    showToast({ message: "已取消上传", icon: "none" });
    return;
  }
  router.back();
};

const resolvePath = async (path: string): Promise<string> => {
  if (path.startsWith("content://")) {
    const { tempPath } = await resolveContentToTempFile(path);
    return tempPath;
  }
  return path;
};

const pickImages = async () => {
  if (uploading.value) return;
  const remain = PAGE_MAX_IMAGES - previews.value.length;
  if (remain <= 0) {
    showToast({ message: `最多上传 ${PAGE_MAX_IMAGES} 张图片`, icon: "none" });
    return;
  }

  uploadCancelled = false;
  try {
    const files = await selectFile(true);
    if (!files || files.length === 0) return;
    const picked = files.flat();
    const toUpload = picked.slice(0, remain);

    uploading.value = true;
    showLoadingToast({
      message: "处理图片中...",
      forbidClick: true,
      duration: 0,
    });

    for (const origin of toUpload) {
      if (uploadCancelled) return;
      const filePath = await resolvePath(origin);
      const compressed = await invoke<string>(
        "compress_image_to_webp_command",
        { inputPath: filePath }
      );
      if (uploadCancelled) return;

      const preview = convertPathToTauriUrl(compressed);
      if (preview) previews.value.push(preview);

      showLoadingToast({
        message: "上传图片中...",
        forbidClick: true,
        duration: 0,
      });
      const res = await invoke<{ status: number; body: string }>(
        "upload_file_request",
        {
          url: `${TALK_API}/file_integrated/upload/moment`,
          filePath: compressed,
          fieldName: "file",
        }
      );
      if (uploadCancelled) return;

      if (res.status === 200) {
        const json = JSON.parse(res.body);
        if (json.code === 200 && json.data) {
          fileIds.value.push(json.data);
        } else {
          showToast(json.message || "上传图片失败");
          if (preview) previews.value.pop();
        }
      } else {
        showToast(`上传失败(${res.status})`);
        if (preview) previews.value.pop();
      }
    }
  } catch (e) {
    console.error("上传动态图片失败:", e);
    showToast("上传动态图片失败");
  } finally {
    closeToast();
    uploading.value = false;
    canPublish.value = !!content.value.trim();
  }
};

const removeImage = (index: number) => {
  previews.value.splice(index, 1);
  fileIds.value.splice(index, 1);
};

const publish = async () => {
  const trimmed = content.value.trim();
  if (publishing.value) return;
  if (!trimmed) {
    showToast({ message: "请输入内容", icon: "none" });
    return;
  }
  publishing.value = true;
  try {
    await create_moment({
      content: trimmed,
      visibility: visibility.value,
      file_ids: fileIds.value,
    });
    showToast({ message: "发布成功", icon: "success" });
    setTimeout(() => router.back(), 500);
  } catch (e) {
    console.error("发布动态失败:", e);
    showToast((e as Error).message || "发布动态失败");
  } finally {
    publishing.value = false;
  }
};

const setVisibility = (v: number) => {
  visibility.value = v;
};
</script>

<template>
  <div class="composer-page">
    <div class="header">
      <button class="back-btn" @click="back">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
          />
        </svg>
      </button>
      <h1 class="title">发布动态</h1>
      <button
        class="publish-btn"
        :disabled="publishing || uploading || !canPublish"
        @click="publish"
      >
        {{ publishing ? "发布中..." : "发布" }}
      </button>
    </div>

    <div class="body">
      <textarea
        v-model="content"
        class="content-input"
        placeholder="分享你的新鲜事..."
        maxlength="2000"
        rows="6"
        @input="onContentInput"
      ></textarea>
      <div class="count">{{ content.length }}/2000</div>

      <div class="visibility-row">
        <span class="vis-label">谁可以看</span>
        <div class="seg">
          <button
            class="seg-item"
            :class="{ on: visibility === 0 }"
            @click="setVisibility(0)"
          >
            公开
          </button>
          <button
            class="seg-item"
            :class="{ on: visibility === 1 }"
            @click="setVisibility(1)"
          >
            仅自己
          </button>
        </div>
      </div>

      <div class="media-area">
        <div class="media-grid">
          <div v-for="(img, i) in previews" :key="i" class="preview-item">
            <img :src="img" alt="" class="preview-img" />
            <button class="remove-btn" @click="removeImage(i)">×</button>
          </div>

          <button
            v-if="previews.length < PAGE_MAX_IMAGES"
            class="add-btn"
            :disabled="uploading"
            @click="pickImages"
          >
            <span v-if="uploading" class="uploading-hint">上传中...</span>
            <template v-else>
              <svg class="add-icon" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 5v14M5 12h14"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                />
              </svg>
              <span class="add-text">图片</span>
            </template>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.composer-page {
  min-height: 100vh;
  background: var(--page-bg);
  padding-bottom: 40px;
}

.header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: max(12px, env(safe-area-inset-top)) 16px;
  background: var(--header-bg);
  backdrop-filter: blur(20px);
  position: sticky;
  top: 0;
  z-index: 50;
  border-bottom: 1px solid var(--border-light);
}

.back-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;

  svg {
    width: 24px;
    height: 24px;
  }
}

.title {
  flex: 1;
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.publish-btn {
  height: 34px;
  padding: 0 18px;
  border: none;
  border-radius: var(--radius-full);
  background: var(--gradient-primary);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.body {
  padding: 16px;
}

.content-input {
  width: 100%;
  padding: 14px;
  background: var(--card-bg);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  color: var(--text-primary);
  font-size: 16px;
  line-height: 1.6;
  outline: none;
  resize: none;
  box-sizing: border-box;

  &::placeholder {
    color: var(--text-placeholder);
  }
}

.count {
  text-align: right;
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.visibility-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
  padding: 12px 0;
}

.vis-label {
  font-size: 14px;
  color: var(--text-secondary);
}

.seg {
  display: flex;
  gap: 4px;
  padding: 3px;
  background: var(--surface);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-lg);
}

.seg-item {
  height: 30px;
  padding: 0 16px;
  border: none;
  border-radius: calc(var(--radius-lg) - 4px);
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;

  &.on {
    background: var(--gradient-primary);
    color: #fff;
    font-weight: 600;
  }
}

.media-area {
  margin-top: 8px;
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.preview-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--surface-hover);
}

.preview-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.remove-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 16px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.add-btn {
  aspect-ratio: 1;
  border: 1px dashed var(--border-medium);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text-tertiary);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
  }
}

.add-icon {
  width: 26px;
  height: 26px;
}

.add-text {
  font-size: 12px;
}

.uploading-hint {
  font-size: 12px;
  color: var(--text-tertiary);
}
</style>
