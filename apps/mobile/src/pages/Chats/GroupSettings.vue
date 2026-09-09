<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { invoke } from "@tauri-apps/api/core";
import { showToast, showConfirmDialog } from "vant";
import {
  get_group_info,
  get_group_members,
  update_group,
  dissolve_group,
  quit_group,
  invite_group_members,
  remove_group_member,
  set_member_role,
  get_friend_list,
  selectFile,
} from "@workspace/services";
import type { GroupInfoVo, GroupMemberVo, FriendVo } from "@workspace/types";
import { TALK_API } from "@workspace/types";
import { useGroupMemberInfo } from "@/hooks/useGroupMemberInfo";
import { useAvatar } from "@/hooks/useAvatar";
import { getMyUuid } from "@/utils/api";
import { resolveContentToTempFile } from "@/utils/tempImage";
import { DEFAULT_AVATAR, useUserStore } from "@/stores/user";

const route = useRoute();
const router = useRouter();
const groupId = route.params.groupId as string;

const { getAvatarUrl } = useAvatar();
const { userInfo, loadUserInfo } = useUserStore();

const groupInfo = ref<GroupInfoVo | null>(null);
const members = ref<GroupMemberVo[]>([]);
const loading = ref(true);
const myUuid = ref("");

const groupAvatarUrl = ref<string | null>(null);
const showNameEdit = ref(false);
const showDescEdit = ref(false);
const nameDraft = ref("");
const descDraft = ref("");
const savingFlag = ref(false);
const avatarUploading = ref(false);

const memberUuids = computed(() =>
  members.value.map((m) => m.user_uuid).filter(Boolean)
);
const { memberMap, avatarUrlMap } = useGroupMemberInfo(() => memberUuids.value);

const getMemberName = (m: GroupMemberVo) => {
  const info = memberMap[m.user_uuid];
  return info?.username || m.nickname || m.user_uuid;
};

const getMemberAvatar = (m: GroupMemberVo) => avatarUrlMap[m.user_uuid] || null;

const ROLE_TEXT: Record<number, string> = {
  2: "群主",
  1: "管理员",
  0: "成员",
};

const myMember = computed(() =>
  members.value.find((m) => m.user_uuid === myUuid.value)
);
const isOwner = computed(
  () => !!groupInfo.value && groupInfo.value.owner_uuid === myUuid.value
);
const isAdminOrOwner = computed(
  () => !!myMember.value && myMember.value.role >= 1
);
const canManage = isAdminOrOwner;

const fmtDate = (ts?: number) => {
  if (!ts) return "-";
  return new Date(ts > 1e12 ? ts : ts * 1000).toLocaleDateString("zh-CN");
};

const loadData = async () => {
  try {
    const [info, memberList] = await Promise.allSettled([
      get_group_info(groupId),
      get_group_members(groupId),
    ]);
    if (info.status === "fulfilled") {
      groupInfo.value = info.value;
      if (info.value.avatar) {
        groupAvatarUrl.value = await getAvatarUrl(info.value.avatar);
      } else {
        groupAvatarUrl.value = null;
      }
      // HTTP 群信息拿到后按群 uuid 定向回写本地群组表(sqlite), 防列表/会话入口显示旧数据
      invoke("update_group_profile_command", {
        groupId: info.value.group_uuid,
        groupName: info.value.group_name,
        avatar: info.value.avatar || "",
        ownerUuid: info.value.owner_uuid,
        memberCount: info.value.member_count,
        createdAt: info.value.created_at || 0,
      }).catch(() => {});
    }
    if (memberList.status === "fulfilled") {
      members.value = memberList.value || [];
    }
  } catch (e) {
    console.error("加载群信息失败:", e);
  } finally {
    loading.value = false;
  }
};

onMounted(async () => {
  myUuid.value = await getMyUuid();
  if (!userInfo.value) await loadUserInfo();
  await loadData();
});

const goBack = () => router.back();

const copyGroupId = async () => {
  if (!groupInfo.value) return;
  try {
    await window.navigator.clipboard.writeText(groupInfo.value.group_uuid);
    showToast({ message: "群号已复制", icon: "success" });
  } catch {
    showToast({ message: "复制失败", icon: "fail" });
  }
};

/* ============ 修改名称 / 描述 ============ */

const openNameEdit = () => {
  nameDraft.value = groupInfo.value?.group_name || "";
  showNameEdit.value = true;
};
const saveName = async () => {
  const name = nameDraft.value.trim();
  if (savingFlag.value) return;
  if (!name) {
    showToast({ message: "群名称不能为空", icon: "none" });
    return;
  }
  savingFlag.value = true;
  try {
    await update_group({
      group_uuid: groupId,
      group_name: name,
      description: groupInfo.value?.description,
    });
    showNameEdit.value = false;
    await loadData();
    showToast({ message: "已保存", icon: "success" });
  } catch (e) {
    showToast((e as Error).message || "保存失败");
  } finally {
    savingFlag.value = false;
  }
};

const openDescEdit = () => {
  descDraft.value = groupInfo.value?.description || "";
  showDescEdit.value = true;
};
const saveDesc = async () => {
  if (savingFlag.value) return;
  savingFlag.value = true;
  try {
    await update_group({
      group_uuid: groupId,
      group_name: groupInfo.value?.group_name || "",
      description: descDraft.value.trim(),
    });
    showDescEdit.value = false;
    await loadData();
    showToast({ message: "已保存", icon: "success" });
  } catch (e) {
    showToast((e as Error).message || "保存失败");
  } finally {
    savingFlag.value = false;
  }
};

/* ============ 更换群头像 ============ */

const changeAvatar = async () => {
  if (!canManage.value || avatarUploading.value) return;
  try {
    const files = await selectFile(false);
    if (!files || files.length === 0) return;
    let filePath = files[0];
    if (filePath.startsWith("content://")) {
      const { tempPath } = await resolveContentToTempFile(filePath);
      filePath = tempPath;
    }
    avatarUploading.value = true;
    showToast({ message: "处理头像中...", icon: "none" });
    const compressed = await invoke<string>("compress_image_to_webp_command", {
      inputPath: filePath,
    });
    showToast({ message: "上传头像中...", icon: "none" });
    const res = await invoke<{ status: number; body: string }>(
      "upload_file_request",
      {
        url: `${TALK_API}/file_integrated/upload/group_avatar/${groupId}`,
        filePath: compressed,
        fieldName: "file",
      }
    );
    if (res.status === 200) {
      const json = JSON.parse(res.body);
      if (json.code === 200 && json.data) {
        const url = await getAvatarUrl(json.data);
        groupAvatarUrl.value = url;
        groupInfo.value = {
          ...groupInfo.value!,
          avatar: json.data,
        };
        await loadData();
        showToast({ message: "群头像已更新", icon: "success" });
      } else {
        showToast(json.message || "上传头像失败");
      }
    } else {
      showToast(`上传失败(${res.status})`);
    }
  } catch (e) {
    console.error("更换群头像失败:", e);
    showToast("更换群头像失败");
  } finally {
    avatarUploading.value = false;
  }
};

/* ============ 成员管理 ============ */

const invitePopup = ref(false);
const friendList = ref<FriendVo[]>([]);
const selectedFriendIds = ref<string[]>([]);
const inviteLoading = ref(false);

const loadFriendsForInvite = async () => {
  try {
    const friends = await get_friend_list();
    const memberSet = new Set(members.value.map((m) => m.user_uuid));
    friendList.value = (friends || []).filter(
      (f) => !memberSet.has(f.friend_id)
    );
    selectedFriendIds.value = [];
  } catch (e) {
    showToast("获取好友列表失败");
  }
};

const openInvite = async () => {
  invitePopup.value = true;
  await loadFriendsForInvite();
};

const toggleFriend = (id: string) => {
  const idx = selectedFriendIds.value.indexOf(id);
  if (idx === -1) selectedFriendIds.value.push(id);
  else selectedFriendIds.value.splice(idx, 1);
};

const sendInvite = async () => {
  if (inviteLoading.value) return;
  if (selectedFriendIds.value.length === 0) {
    showToast({ message: "请选择要邀请的好友", icon: "none" });
    return;
  }
  inviteLoading.value = true;
  try {
    const invited = await invite_group_members(
      groupId,
      selectedFriendIds.value
    );
    invitePopup.value = false;
    await loadData();
    showToast({
      message: `已邀请 ${invited.length} 位好友`,
      icon: "success",
    });
  } catch (e) {
    showToast((e as Error).message || "邀请失败");
  } finally {
    inviteLoading.value = false;
  }
};

/* 成员操作(action-sheet) */
const activeMember = ref<GroupMemberVo | null>(null);
const showMemberSheet = ref(false);
const memberActions = ref<
  { name: string; danger?: boolean; callback: () => void }[]
>([]);

const openMemberActions = (m: GroupMemberVo) => {
  if (m.user_uuid === myUuid.value) return;
  const actions: { name: string; danger?: boolean; callback: () => void }[] =
    [];
  if (isOwner.value) {
    if (m.role === 0) {
      actions.push({ name: "设为管理员", callback: () => setRole(m, 1) });
    } else if (m.role === 1) {
      actions.push({ name: "取消管理员", callback: () => setRole(m, 0) });
    }
    if (m.role !== 2) {
      actions.push({
        name: "移出群聊",
        danger: true,
        callback: () => kickMember(m),
      });
    }
  } else if (isAdminOrOwner.value && m.role === 0) {
    actions.push({
      name: "移出群聊",
      danger: true,
      callback: () => kickMember(m),
    });
  }
  if (actions.length === 0) return;
  activeMember.value = m;
  memberActions.value = actions;
  showMemberSheet.value = true;
};

const onMemberSheetSelect = (action: { name: string; danger?: boolean }) => {
  showMemberSheet.value = false;
  const found = memberActions.value.find((a) => a.name === action.name);
  found?.callback();
};

const setRole = async (m: GroupMemberVo, role: number) => {
  try {
    await set_member_role({
      group_uuid: groupId,
      user_uuid: m.user_uuid,
      role,
    });
    showToast(role === 1 ? "已设为管理员" : "已取消管理员");
    await loadData();
  } catch (e) {
    showToast((e as Error).message || "设置失败");
  }
};

const kickMember = async (m: GroupMemberVo) => {
  try {
    await showConfirmDialog({
      title: "移出群聊",
      message: `确定将「${getMemberName(m)}」移出群聊吗？`,
      confirmButtonText: "移出",
      confirmButtonColor: "#ef4444",
      cancelButtonText: "取消",
    });
  } catch {
    return;
  }
  try {
    await remove_group_member(groupId, m.user_uuid);
    showToast({ message: "已移出群聊", icon: "success" });
    await loadData();
  } catch (e) {
    showToast((e as Error).message || "移除失败");
  }
};

/* ============ 群主 / 普通成员操作 ============ */

const transferMemberSheet = ref(false);
const transferTarget = ref<string | null>(null);
const transferCandidates = computed(() =>
  members.value.filter((m) => m.user_uuid !== myUuid.value)
);

const openTransfer = () => {
  if (transferCandidates.value.length === 0) {
    showToast({ message: "没有可转让的成员", icon: "none" });
    return;
  }
  transferTarget.value = null;
  transferMemberSheet.value = true;
};

const confirmTransfer = async (m: GroupMemberVo) => {
  transferMemberSheet.value = false;
  try {
    await set_member_role({
      group_uuid: groupId,
      user_uuid: m.user_uuid,
      role: 2,
    });
    showToast({ message: "群主已转让", icon: "success" });
    await loadData();
  } catch (e) {
    showToast((e as Error).message || "转让失败");
  }
};

const handleLeave = async () => {
  try {
    await showConfirmDialog({
      title: "退出群聊",
      message: "确定要退出该群聊吗？",
      confirmButtonText: "退出",
      confirmButtonColor: "#ef4444",
      cancelButtonText: "取消",
    });
  } catch {
    return;
  }
  try {
    await quit_group(groupId);
    showToast({ message: "已退出群聊", icon: "success" });
    setTimeout(() => router.replace("/chats"), 500);
  } catch (e) {
    showToast((e as Error).message || "退出失败");
  }
};

const handleDissolve = async () => {
  try {
    await showConfirmDialog({
      title: "解散群聊",
      message: "解散后群聊将被删除，确定解散吗？",
      confirmButtonText: "解散",
      confirmButtonColor: "#ef4444",
      cancelButtonText: "取消",
    });
  } catch {
    return;
  }
  try {
    await dissolve_group(groupId);
    showToast({ message: "群聊已解散", icon: "success" });
    setTimeout(() => router.replace("/chats"), 500);
  } catch (e) {
    showToast((e as Error).message || "解散失败");
  }
};
</script>

<template>
  <div class="group-settings-page">
    <div class="header">
      <button class="back-btn" @click="goBack">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
          />
        </svg>
      </button>
      <h1 class="title">群设置</h1>
    </div>

    <div v-if="loading" class="loading-box">
      <div class="loading-spinner"></div>
      <p>加载中...</p>
    </div>

    <template v-else-if="groupInfo">
      <div class="body">
        <!-- 群信息头部 -->
        <div class="group-head">
          <div
            class="group-avatar-wrap"
            :class="{ editable: canManage }"
            @click="changeAvatar"
          >
            <img
              :src="groupAvatarUrl || DEFAULT_AVATAR"
              alt="群头像"
              class="group-avatar"
              @error="($event.target as HTMLImageElement).src = DEFAULT_AVATAR"
            />
            <span v-if="canManage" class="avatar-edit-badge">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M9 2l1.83 2H9c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-1.83L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"
                />
              </svg>
            </span>
          </div>
          <div class="group-info-text">
            <span
              class="group-name"
              :class="{ editable: canManage }"
              @click="canManage && openNameEdit()"
            >
              {{ groupInfo.group_name }}
              <svg
                v-if="canManage"
                class="name-edit-icon"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path
                  d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                />
              </svg>
            </span>
            <span class="group-meta">{{ groupInfo.member_count }} 位成员</span>
          </div>
        </div>

        <!-- 描述 -->
        <div
          v-if="groupInfo.description || canManage"
          class="desc-row"
          @click="canManage && openDescEdit()"
        >
          <span class="desc-text">
            {{ groupInfo.description || "添加群描述" }}
          </span>
          <svg
            v-if="canManage"
            class="edit-icon"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path
              d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
            />
          </svg>
        </div>

        <!-- 基本信息 -->
        <div class="info-list">
          <div class="info-item" @click="copyGroupId">
            <span class="info-label">群号</span>
            <span class="info-value">{{ groupInfo.group_uuid }}</span>
            <span class="arrow">›</span>
          </div>
          <div class="info-item">
            <span class="info-label">群主</span>
            <span class="info-value">{{
              memberMap[groupInfo.owner_uuid]?.username || groupInfo.owner_uuid
            }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">创建时间</span>
            <span class="info-value">{{ fmtDate(groupInfo.created_at) }}</span>
          </div>
        </div>

        <!-- 群成员 -->
        <div class="section">
          <div class="section-head">
            <span class="section-title">群成员 ({{ members.length }})</span>
            <button v-if="canManage" class="add-member-btn" @click="openInvite">
              添加成员
            </button>
          </div>

          <div class="member-list">
            <div
              v-for="m in members"
              :key="m.user_uuid"
              class="member-item"
              @click="openMemberActions(m)"
            >
              <img
                :src="getMemberAvatar(m) || DEFAULT_AVATAR"
                alt="头像"
                class="member-avatar"
                @error="
                  ($event.target as HTMLImageElement).src = DEFAULT_AVATAR
                "
              />
              <span class="member-name">{{ getMemberName(m) }}</span>
              <span
                v-if="m.role > 0"
                class="role-tag"
                :class="{ owner: m.role === 2, admin: m.role === 1 }"
                >{{ ROLE_TEXT[m.role] }}</span
              >
              <span v-if="m.user_uuid === myUuid" class="me-tag">我</span>
            </div>
          </div>
        </div>

        <!-- 危险操作 -->
        <div class="section">
          <template v-if="isOwner">
            <button class="action-btn" @click="openTransfer">群主转让</button>
            <button class="action-btn danger" @click="handleDissolve">
              解散群聊
            </button>
          </template>
          <template v-else>
            <button class="action-btn danger" @click="handleLeave">
              退出群聊
            </button>
          </template>
        </div>
      </div>
    </template>

    <!-- 修改群名称 -->
    <van-popup
      v-model:show="showNameEdit"
      position="bottom"
      round
      :style="{ padding: '20px 16px' }"
      class="edit-popup"
    >
      <div class="edit-popup-title">修改群名称</div>
      <div class="edit-input-wrap">
        <input
          v-model="nameDraft"
          class="edit-input"
          maxlength="100"
          placeholder="请输入群名称"
        />
      </div>
      <div class="edit-popup-actions">
        <button class="popup-btn" @click="showNameEdit = false">取消</button>
        <button
          class="popup-btn primary"
          :disabled="savingFlag"
          @click="saveName"
        >
          保存
        </button>
      </div>
    </van-popup>

    <!-- 修改群描述 -->
    <van-popup
      v-model:show="showDescEdit"
      position="bottom"
      round
      :style="{ padding: '20px 16px' }"
      class="edit-popup"
    >
      <div class="edit-popup-title">修改群描述</div>
      <div class="edit-input-wrap">
        <textarea
          v-model="descDraft"
          class="edit-input edit-textarea"
          maxlength="500"
          rows="3"
          placeholder="请输入群描述"
        ></textarea>
      </div>
      <div class="edit-popup-actions">
        <button class="popup-btn" @click="showDescEdit = false">取消</button>
        <button
          class="popup-btn primary"
          :disabled="savingFlag"
          @click="saveDesc"
        >
          保存
        </button>
      </div>
    </van-popup>

    <!-- 邀请好友 -->
    <van-popup
      v-model:show="invitePopup"
      position="bottom"
      round
      :style="{ height: '70%' }"
      class="invite-popup"
    >
      <div class="invite-head">
        <span class="invite-title">邀请好友进群</span>
        <button class="invite-close" @click="invitePopup = false">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
            />
          </svg>
        </button>
      </div>
      <div class="invite-body">
        <div
          v-for="f in friendList"
          :key="f.friend_id"
          class="invite-item"
          @click="toggleFriend(f.friend_id)"
        >
          <span
            class="checkbox"
            :class="{ on: selectedFriendIds.includes(f.friend_id) }"
          >
            <svg
              v-if="selectedFriendIds.includes(f.friend_id)"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
          </span>
          <span class="invite-name">{{ f.friend_name }}</span>
          <span class="invite-account">@{{ f.friend_account }}</span>
        </div>
        <div v-if="friendList.length === 0" class="invite-empty">
          没有可邀请的好友
        </div>
      </div>
      <div class="invite-footer">
        <button
          class="invite-submit"
          :disabled="inviteLoading || selectedFriendIds.length === 0"
          @click="sendInvite"
        >
          {{
            inviteLoading ? "邀请中..." : `邀请 (${selectedFriendIds.length})`
          }}
        </button>
      </div>
    </van-popup>

    <!-- 成员操作 -->
    <van-action-sheet
      v-model:show="showMemberSheet"
      :actions="memberActions"
      cancel-text="取消"
      @select="onMemberSheetSelect"
    />

    <!-- 群主转让 -->
    <van-action-sheet
      v-model:show="transferMemberSheet"
      cancel-text="取消"
      :close-on-click-action="false"
    >
      <div class="transfer-body">
        <div class="transfer-title">选择要转让的成员</div>
        <div
          v-for="m in transferCandidates"
          :key="m.user_uuid"
          class="transfer-item"
          @click="confirmTransfer(m)"
        >
          <img
            :src="getMemberAvatar(m) || DEFAULT_AVATAR"
            alt="头像"
            class="member-avatar"
            @error="($event.target as HTMLImageElement).src = DEFAULT_AVATAR"
          />
          <span class="member-name">{{ getMemberName(m) }}</span>
          <span class="arrow">›</span>
        </div>
      </div>
    </van-action-sheet>
  </div>
</template>

<style scoped lang="less">
.group-settings-page {
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
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.loading-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 80px 0;
  color: var(--text-tertiary);
  p {
    font-size: 14px;
    margin: 0;
  }
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-medium);
  border-top-color: var(--brand-blue);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.body {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.group-head {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  background: var(--card-bg);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
}

.group-avatar-wrap {
  position: relative;
  flex-shrink: 0;

  &.editable {
    cursor: pointer;
  }
}

.group-avatar {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-md);
  object-fit: cover;
  background: var(--surface-hover);
  display: block;
}

.avatar-edit-badge {
  position: absolute;
  bottom: -4px;
  right: -4px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--brand-blue);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--card-bg);

  svg {
    width: 13px;
    height: 13px;
  }
}

.group-info-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.group-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 6px;

  &.editable {
    cursor: pointer;
  }
}

.name-edit-icon {
  flex-shrink: 0;
  width: 15px;
  height: 15px;
  color: var(--text-placeholder);
}

.group-meta {
  font-size: 13px;
  color: var(--text-tertiary);
}

.desc-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 18px;
  background: var(--card-bg);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
  cursor: pointer;
}

.desc-text {
  flex: 1;
  font-size: 14px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.edit-icon {
  width: 16px;
  height: 16px;
  color: var(--text-placeholder);
  flex-shrink: 0;
}

.info-list {
  background: var(--card-bg);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
  overflow: hidden;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border-light);
  cursor: pointer;

  &:last-child {
    border-bottom: none;
  }
}

.info-label {
  flex-shrink: 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.info-value {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  color: var(--text-primary);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.arrow {
  flex-shrink: 0;
  color: var(--text-placeholder);
  font-size: 18px;
}

.section {
  background: var(--card-bg);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
  padding: 14px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-light);
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.add-member-btn {
  height: 30px;
  padding: 0 14px;
  border: none;
  border-radius: var(--radius-full);
  background: var(--gradient-primary);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}

.member-list {
  display: flex;
  flex-direction: column;
}

.member-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 4px;
  border-bottom: 1px solid var(--border-light);
  cursor: pointer;

  &:last-child {
    border-bottom: none;
  }
}

.member-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--surface-hover);
  flex-shrink: 0;
}

.member-name {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-tag {
  flex-shrink: 0;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  color: #fff;

  &.owner {
    background: var(--gradient-primary);
  }

  &.admin {
    background: var(--brand-blue);
  }
}

.me-tag {
  flex-shrink: 0;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--surface-hover);
  color: var(--text-tertiary);
}

.action-btn {
  display: block;
  width: 100%;
  height: 44px;
  margin-bottom: 10px;
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text-primary);
  font-size: 15px;
  cursor: pointer;

  &:last-child {
    margin-bottom: 0;
  }

  &.danger {
    color: var(--color-error);
    border-color: rgba(239, 68, 68, 0.3);
  }
}

.edit-popup {
  background: var(--card-bg);
}

.edit-popup-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 14px;
}

.edit-input-wrap {
  padding: 4px 0;
}

.edit-input {
  width: 100%;
  padding: 10px 12px;
  background: var(--surface);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 15px;
  outline: none;
  box-sizing: border-box;
}

.edit-textarea {
  resize: none;
}

.edit-popup-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

.popup-btn {
  flex: 1;
  height: 42px;
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 15px;
  cursor: pointer;

  &.primary {
    border: none;
    background: var(--gradient-primary);
    color: #fff;
    font-weight: 600;

    &:disabled {
      opacity: 0.6;
    }
  }
}

.invite-popup {
  overflow: hidden;
}

.invite-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 10px;
}

.invite-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.invite-close {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: var(--surface-hover);
  color: var(--text-tertiary);
  cursor: pointer;

  svg {
    width: 16px;
    height: 16px;
  }
}

.invite-body {
  height: calc(100% - 120px);
  overflow-y: auto;
  padding: 0 20px;
}

.invite-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-light);
  cursor: pointer;

  &:last-child {
    border-bottom: none;
  }
}

.checkbox {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;

  &.on {
    background: var(--brand-blue);
    border-color: var(--brand-blue);
  }

  svg {
    width: 14px;
    height: 14px;
  }
}

.invite-name {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.invite-account {
  font-size: 12px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.invite-empty {
  padding: 30px 0;
  text-align: center;
  font-size: 13px;
  color: var(--text-tertiary);
}

.invite-footer {
  padding: 12px 20px calc(12px + env(safe-area-inset-bottom));
}

.invite-submit {
  width: 100%;
  height: 44px;
  border: none;
  border-radius: var(--radius-full);
  background: var(--gradient-primary);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
  }
}

.transfer-body {
  padding: 16px 8px 8px;
}

.transfer-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  padding: 0 12px 8px;
}

.transfer-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  cursor: pointer;

  &:active {
    background: var(--surface-hover);
  }
}
</style>
