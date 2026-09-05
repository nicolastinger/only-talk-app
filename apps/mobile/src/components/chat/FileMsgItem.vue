<script setup lang="ts">
import { computed } from "vue";
import type { UiChatMessage } from "@/chat/types";
import {
  MSG_TYPE_FILE,
  MSG_TYPE_GROUP_FILE,
} from "@/chat/messageTypes";
import {
  basename,
  extensionOf,
  isLocalFilePath,
  parseGroupFileRecord,
  parsePrivateFileRecord,
} from "@/chat/messageParse";
import FileMsg from "./FileMsg.vue";

const props = defineProps<{ msg: UiChatMessage }>();

const display = computed(() => {
  const { raw, text_type, nano_id } = props.msg.textMsg;
  if (isLocalFilePath(raw)) {
    const fileName = basename(raw);
    return { fileName, fileSize: 0, fileType: extensionOf(fileName), localPath: raw };
  }
  if (text_type === MSG_TYPE_FILE) {
    const record = parsePrivateFileRecord(raw);
    if (!record) return null;
    return {
      fileName: record.file_name || "文件",
      fileSize: record.file_size || 0,
      fileType: record.file_type || extensionOf(record.file_name),
      bizId: record.biz_id,
      nanoId: nano_id,
    };
  }
  if (text_type === MSG_TYPE_GROUP_FILE) {
    const record = parseGroupFileRecord(raw);
    if (!record) return null;
    return {
      fileName: record.file_name || "文件",
      fileSize: record.file_size || 0,
      fileType: record.file_type || extensionOf(record.file_name),
      bizId: record.biz_id,
      nanoId: nano_id,
    };
  }
  return null;
});
</script>

<template>
  <FileMsg
    v-if="display"
    :fileName="display.fileName"
    :file-size="display.fileSize"
    :file-type="display.fileType"
    :biz-id="display.bizId"
    :nano-id="display.nanoId"
    :local-path="display.localPath"
  />
  <div v-else class="file-fallback">[文件]</div>
</template>

<style scoped lang="less">
.file-fallback {
  padding: 10px 14px;
  font-size: 13px;
  color: var(--text-secondary);
}
</style>
