<script setup lang="ts">
import { ref, reactive, onMounted, nextTick, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { invoke } from "@tauri-apps/api/core";
import { showToast } from "vant";
import { useMessageApi } from "@/hooks/useMessageApi";
import { getMyUuid } from "@/utils/api";
import { formatMessageTime } from "@/utils/time";
import type { TextQuicMsgVo, ChatSessionVo } from "@workspace/types";

const route = useRoute();
const router = useRouter();
const friendId = route.params.friendId as string;

interface ChatMessage { from: "mine" | "friend" | "system"; textMsg: TextQuicMsgVo; ack: boolean | undefined; showTime: boolean; }

const messages = ref<ChatMessage[]>([]);
const inputText = ref("");
const loading = ref(true);
const loadingMore = ref(false);
const currentPage = ref(1);
const hasMore = ref(true);
const pageSize = 20;
const friendInfo = reactive({ name: "", icon: "" });
const containerRef = ref<HTMLElement | null>(null);
const meUuid = ref("");

const { textMessage } = useMessageApi(() => meUuid.value, friendId);

const loadFriendInfo = async () => {
  try {
    const sessions: ChatSessionVo[] = await invoke("get_chat_session_from_store");
    const session = sessions.find((s) => s.send_user === friendId || s.recv_user === friendId);
    if (session) { friendInfo.name = session.friend_name || friendId; friendInfo.icon = session.friend_icon || ""; }
    else friendInfo.name = friendId;
  } catch { friendInfo.name = friendId; }
};

const loadMessages = async (page: number = 1, prepend: boolean = false) => {
  if (page === 1) loading.value = true; else loadingMore.value = true;
  try {
    const textQuicMsg = { nano_id: "", raw: "", recv_user: meUuid.value, send_user: friendId, text_type: 0, timestamp: 0 };
    const data: TextQuicMsgVo[] = await invoke("get_chat_record_from_store", { textQuicMsg, page: { size: pageSize, current: page, total: 0 } });
    if (data.length < pageSize) hasMore.value = false;

    const chatMessages: ChatMessage[] = data
      .filter((m) => m.text_type !== 201)
      .map((item, index, arr) => ({
        from: (item.send_user === meUuid.value ? "mine" : item.send_user === "system" ? "system" : "friend") as ChatMessage["from"],
        textMsg: item,
        ack: undefined,
        showTime: index === 0 || item.timestamp - arr[index - 1].timestamp > 10 * 60 * 1000,
      }));

    if (prepend) messages.value = [...chatMessages, ...messages.value];
    else { messages.value = chatMessages; currentPage.value = 1; await nextTick(); scrollToBottom(false); }
  } catch (e) { console.error("加载消息失败:", e); }
  finally { loading.value = false; loadingMore.value = false; }
};

const onScroll = () => {
  const el = containerRef.value;
  if (!el || loadingMore.value || !hasMore.value) return;
  if (el.scrollTop <= 80) { const nextPage = currentPage.value + 1; currentPage.value = nextPage; loadMessages(nextPage, true); }
};

const sendMessage = async () => {
  const text = inputText.value.trim(); if (!text) return;
  const nanoId = [...Array(21)].map(() => "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-"[Math.floor(Math.random()*64)]).join("");
  const textMsg: TextQuicMsgVo = { nano_id: nanoId, text_type: 1, raw: JSON.stringify({ text, prev_id: "", platform: 0 }), recv_user: friendId, send_user: "", timestamp: Date.now() };
  const tempMsg: ChatMessage = { from: "mine", textMsg, ack: false, showTime: messages.value.length === 0 || Date.now() - messages.value[messages.value.length-1].textMsg.timestamp > 10*60*1000 };
  messages.value.push(tempMsg); inputText.value = ""; await nextTick(); scrollToBottom(true);
  try { await invoke("send_text_msg", { textQuicMsg: textMsg }); }
  catch (e) { tempMsg.ack = undefined; showToast({ message: "发送失败", icon: "fail" }); }
};

watch(textMessage, (msg) => {
  if (!msg) return;
  if (msg.text_type === 201) {
    const idx = messages.value.findIndex((m) => m.textMsg.nano_id === msg.raw);
    if (idx !== -1) messages.value[idx].ack = true;
  } else {
    if (messages.value.find((m) => m.textMsg.nano_id === msg.nano_id)) return;
    const from = (msg.send_user === meUuid.value ? "mine" : msg.send_user === "system" ? "system" : "friend") as ChatMessage["from"];
    const prev = messages.value[messages.value.length-1];
    messages.value.push({ from, textMsg: msg, ack: undefined, showTime: !prev || msg.timestamp - prev.textMsg.timestamp > 10*60*1000 });
    nextTick(() => scrollToBottom(true));
  }
  invoke("mark_read_chat_session", { friendUuid: friendId }).catch(() => {});
});

onMounted(async () => {
  meUuid.value = await getMyUuid();
  if (!meUuid.value) { router.replace("/login"); return; }
  await loadFriendInfo();
  await loadMessages(1);
  invoke("mark_read_chat_session", { friendUuid: friendId }).catch(() => {});
});

const scrollToBottom = (smooth: boolean) => {
  const el = containerRef.value; if (!el) return;
  el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "instant" as any });
};

const getMessageText = (msg: TextQuicMsgVo): string => {
  switch (msg.text_type) {
    case 1: try { return JSON.parse(msg.raw).text || ""; } catch { return msg.raw || ""; }
    case 2: return "[图片]"; case 3: return "[文件]"; case 4: return "[隐私模式]";
    case 5: return "[视频通话]"; case 100: return "[WebRTC信令]"; default: return msg.raw || "";
  }
};

const getAvatar = () => `https://api.dicebear.com/7.x/avataaars/svg?seed=${friendInfo.name || friendId}`;
const goBack = () => router.back();
</script>

<template>
  <div class="chat-page">
    <div class="header">
      <button class="back-btn" @click="goBack"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" /></svg></button>
      <img :src="getAvatar()" class="header-avatar" @error="($event.target as HTMLImageElement).src='https://api.dicebear.com/7.x/avataaars/svg?seed='+friendId" />
      <div class="header-info"><span class="header-name">{{ friendInfo.name || friendId }}</span></div>
    </div>

    <div v-if="loading" class="loading-state"><div class="loading-spinner"></div><p>加载中...</p></div>

    <div v-else ref="containerRef" class="message-container" @scroll="onScroll">
      <div v-if="loadingMore" class="loading-more"><div class="loading-spinner small"></div></div>
      <div class="message-list">
        <div v-for="msg in messages" :key="msg.textMsg.nano_id">
          <div v-if="msg.showTime" class="time-divider"><span>{{ formatMessageTime(msg.textMsg.timestamp) }}</span></div>
          <div v-if="msg.from==='system'" class="system-msg">{{ getMessageText(msg.textMsg) }}</div>
          <div v-else-if="msg.from==='friend'" class="msg-row msg-left"><div class="bubble bubble-friend"><span class="bubble-text">{{ getMessageText(msg.textMsg) }}</span></div></div>
          <div v-else class="msg-row msg-right">
            <div class="bubble bubble-mine"><span class="bubble-text">{{ getMessageText(msg.textMsg) }}</span></div>
            <span v-if="msg.ack===true" class="ack-icon ack-ok"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zM6.5 10.5L4 8l1-1 1.5 1.5L10 5l1 1-4.5 4.5z"/></svg></span>
            <span v-else-if="msg.ack===false" class="ack-icon ack-pending"><svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="7"/><path d="M8 4v4l3 2" stroke="#fff" stroke-width="1.5" fill="none"/></svg></span>
          </div>
        </div>
      </div>
    </div>

    <div class="input-bar" v-if="!loading">
      <input ref="inputRef" v-model="inputText" class="text-input" placeholder="输入消息..." @keyup.enter="sendMessage" />
      <button class="send-btn" :disabled="!inputText.trim()" @click="sendMessage"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>
    </div>
  </div>
</template>

<style scoped lang="less">
.chat-page { display: flex; flex-direction: column; height: 100vh; background: var(--page-bg); }
.header { display: flex; align-items: center; gap: 12px; padding: 12px 16px; padding-top: max(12px, env(safe-area-inset-top)); background: var(--header-bg); backdrop-filter: blur(20px); border-bottom: 1px solid var(--border-light); flex-shrink: 0; z-index: 50; }
.back-btn { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: var(--surface); border: 1px solid var(--border-medium); border-radius: var(--radius-sm); color: var(--text-tertiary); cursor: pointer; box-shadow: var(--shadow-xs); flex-shrink: 0; svg { width: 20px; height: 20px; } &:active { background: var(--surface-hover); } }
.header-avatar { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; box-shadow: var(--shadow-xs); }
.header-info { flex: 1; min-width: 0; } .header-name { font-size: 16px; font-weight: 600; color: var(--text-primary); }
.loading-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: var(--text-tertiary); p { font-size: 14px; } }
.loading-spinner { width: 32px; height: 32px; border: 3px solid var(--border-medium); border-top-color: var(--brand-blue); border-radius: 50%; animation: spin 0.8s linear infinite; &.small { width: 20px; height: 20px; border-width: 2px; } }
@keyframes spin { to { transform: rotate(360deg); } }
.message-container { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 12px 0; -webkit-overflow-scrolling: touch; }
.loading-more { display: flex; justify-content: center; padding: 12px; }
.message-list { padding: 0 14px; display: flex; flex-direction: column; gap: 2px; }
.time-divider { display: flex; justify-content: center; padding: 12px 0; span { font-size: 11px; color: var(--text-placeholder); background: var(--surface); padding: 4px 12px; border-radius: var(--radius-full); box-shadow: var(--shadow-xs); } }
.system-msg { text-align: center; font-size: 12px; color: var(--text-placeholder); padding: 6px 0; }
.msg-row { display: flex; align-items: flex-end; gap: 6px; margin-bottom: 6px; max-width: 85%; }
.msg-left { align-self: flex-start; } .msg-right { align-self: flex-end; flex-direction: row-reverse; }
.bubble { padding: 10px 14px; border-radius: 18px; word-break: break-word; line-height: 1.5; }
.bubble-friend { background: var(--surface); border-bottom-left-radius: 6px; box-shadow: var(--shadow-xs); border: 1px solid var(--border-light); .bubble-text { color: var(--text-primary); } }
.bubble-mine { background: var(--gradient-primary); border-bottom-right-radius: 6px; box-shadow: var(--shadow-sm); .bubble-text { color: #fff; } }
.bubble-text { font-size: 15px; line-height: 1.5; }
.ack-icon { width: 16px; height: 16px; flex-shrink: 0; svg { width: 100%; height: 100%; } }
.ack-ok { color: var(--color-success); } .ack-pending { color: var(--text-placeholder); opacity: 0.5; }
.input-bar { display: flex; align-items: center; gap: 10px; padding: 10px 14px; padding-bottom: max(10px, env(safe-area-inset-bottom)); background: var(--header-bg); backdrop-filter: blur(20px); border-top: 1px solid var(--border-light); flex-shrink: 0; }
.text-input { flex: 1; height: 40px; padding: 0 16px; background: var(--surface); border: 1px solid var(--border-medium); border-radius: 20px; outline: none; font-size: 15px; color: var(--text-primary); box-shadow: var(--shadow-xs); &::placeholder { color: var(--text-placeholder); } &:focus { border-color: var(--brand-blue); box-shadow: var(--shadow-glow-sm); } }
.send-btn { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: var(--gradient-primary); border: none; border-radius: 50%; color: #fff; cursor: pointer; box-shadow: var(--shadow-sm); flex-shrink: 0; svg { width: 20px; height: 20px; } &:disabled { opacity: 0.4; cursor: not-allowed; } &:active:not(:disabled) { transform: scale(0.95); } }
</style>
