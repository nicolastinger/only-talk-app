<script setup lang="ts">
import { ref } from "vue";

interface Post {
  id: number;
  image: string;
  likes: number;
}

const activeTab = ref(0);
const tabs = ["瞬间", "相册", "收藏"];

const userInfo = ref({
  name: "星空漫步",
  age: 24,
  gender: "♂",
  bio: "热爱生活，喜欢记录美好瞬间 📸",
  location: "北京市",
  joinedTime: "2023年6月加入",
  posts: 128,
  followers: 2345,
  following: 189,
  likes: 8976,
  soulAge: "186天",
  level: 5,
  badges: ["🔥活跃达人", "📷摄影大师", "🌟优质创作者"],
});

const myPosts = ref<Post[]>([
  { id: 1, image: "https://picsum.photos/300/300?random=30", likes: 234 },
  { id: 2, image: "https://picsum.photos/300/300?random=31", likes: 189 },
  { id: 3, image: "https://picsum.photos/300/300?random=32", likes: 456 },
  { id: 4, image: "https://picsum.photos/300/300?random=33", likes: 123 },
  { id: 5, image: "https://picsum.photos/300/300?random=34", likes: 567 },
  { id: 6, image: "https://picsum.photos/300/300?random=35", likes: 89 },
]);

const menuItems = [
  { id: 1, icon: "💬", name: "消息", badge: 5 },
  { id: 2, icon: "👥", name: "好友", badge: 0 },
  { id: 3, icon: "🔔", name: "通知", badge: 12 },
  { id: 4, icon: "🎁", name: "钱包", badge: 0 },
  { id: 5, icon: "📊", name: "数据", badge: 0 },
  { id: 6, icon: "🎨", name: "个性设置", badge: 0 },
  { id: 7, icon: "🔒", name: "隐私与安全", badge: 0 },
  { id: 8, icon: "❓", name: "帮助与反馈", badge: 0 },
];

const settings = [
  { id: 1, name: "夜间模式", icon: "🌙", enabled: false },
  { id: 2, name: "勿扰模式", icon: "🔕", enabled: false },
  { id: 3, name: "省流模式", icon: "📶", enabled: true },
];
</script>

<template>
  <div class="profile-page">
    <div class="profile-header">
      <div class="header-top">
        <div class="settings-icon">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
            />
          </svg>
        </div>
        <div class="qrcode-icon">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M3 11h8V3H3v8zm2-6h4v4H5V5zm8-2v8h8V3h-8zm6 6h-4V5h4v4zM3 21h8v-8H3v8zm2-6h4v4H5v-4zm13-2h-2v2h2v-2zm0 6h2v-2h-2v2zm-4-6h2v4h-2v-4zm2 4h2v2h-2v-2zm-2 2h-2v2h2v-2zm0-6h2v2h-2v-2z"
            />
          </svg>
        </div>
      </div>

      <div class="user-info">
        <div class="avatar-wrapper">
          <img
            src="https://api.dicebear.com/7.x/avataaars/svg?seed=1"
            alt="avatar"
            class="avatar"
          />
          <div class="level-badge">Lv.{{ userInfo.level }}</div>
        </div>

        <div class="user-details">
          <h1 class="user-name">
            {{ userInfo.name }}
            <span class="user-age">{{ userInfo.age }}岁</span>
          </h1>
          <p class="user-bio">{{ userInfo.bio }}</p>
          <div class="user-meta">
            <span class="meta-item">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
                />
              </svg>
              {{ userInfo.location }}
            </span>
            <span class="meta-item">{{ userInfo.joinedTime }}</span>
          </div>
        </div>
      </div>

      <div class="stats-bar">
        <div class="stat-item">
          <span class="stat-value">{{ userInfo.posts }}</span>
          <span class="stat-label">发布</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ userInfo.followers }}</span>
          <span class="stat-label">粉丝</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ userInfo.following }}</span>
          <span class="stat-label">关注</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ userInfo.likes }}</span>
          <span class="stat-label">获赞</span>
        </div>
      </div>

      <div class="badges">
        <span v-for="badge in userInfo.badges" :key="badge" class="badge-item">
          {{ badge }}
        </span>
      </div>

      <div class="profile-actions">
        <button class="action-btn edit">编辑资料</button>
        <button class="action-btn share">分享主页</button>
      </div>
    </div>

    <div class="quick-settings">
      <div v-for="setting in settings" :key="setting.id" class="setting-item">
        <span class="setting-icon">{{ setting.icon }}</span>
        <span class="setting-name">{{ setting.name }}</span>
        <label class="switch">
          <input type="checkbox" :checked="setting.enabled" />
          <span class="slider"></span>
        </label>
      </div>
    </div>

    <div class="menu-section">
      <div v-for="item in menuItems" :key="item.id" class="menu-item">
        <div class="menu-left">
          <span class="menu-icon">{{ item.icon }}</span>
          <span class="menu-name">{{ item.name }}</span>
        </div>
        <div class="menu-right">
          <span v-if="item.badge > 0" class="menu-badge">{{ item.badge }}</span>
          <svg class="arrow" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
          </svg>
        </div>
      </div>
    </div>

    <div class="content-section">
      <div class="tabs">
        <button
          v-for="(tab, index) in tabs"
          :key="tab"
          class="tab-btn"
          :class="{ active: activeTab === index }"
          @click="activeTab = index"
        >
          {{ tab }}
        </button>
      </div>

      <div class="content-grid">
        <div v-for="post in myPosts" :key="post.id" class="content-item">
          <img :src="post.image" alt="post" class="content-image" />
          <div class="content-overlay">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
              />
            </svg>
            <span>{{ post.likes }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="logout-section">
      <button class="logout-btn">退出登录</button>
    </div>
  </div>
</template>

<style scoped lang="less">
.profile-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #0f0f23 0%, #1a1a2e 100%);
  padding-bottom: 80px;
}

.profile-header {
  padding: 16px;
  background: linear-gradient(
    180deg,
    rgba(99, 102, 241, 0.15) 0%,
    transparent 100%
  );
}

.header-top {
  display: flex;
  justify-content: flex-end;
  gap: 16px;
  margin-bottom: 16px;
}

.settings-icon,
.qrcode-icon {
  width: 24px;
  height: 24px;
  color: #e2e8f0;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  transition: all 0.3s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
}

.user-info {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
}

.avatar-wrapper {
  position: relative;
  flex-shrink: 0;
}

.avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  border: 3px solid rgba(99, 102, 241, 0.5);
}

.level-badge {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: white;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
}

.user-details {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
}

.user-name {
  font-size: 20px;
  font-weight: 700;
  color: #f1f5f9;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-age {
  font-size: 14px;
  font-weight: 400;
  color: #64748b;
}

.user-bio {
  font-size: 13px;
  color: #94a3b8;
  margin: 0;
  line-height: 1.4;
}

.user-meta {
  display: flex;
  gap: 12px;
  margin-top: 4px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #64748b;

  svg {
    width: 14px;
    height: 14px;
  }
}

.stats-bar {
  display: flex;
  justify-content: space-around;
  padding: 16px 0;
  margin-bottom: 16px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 16px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.stat-value {
  font-size: 18px;
  font-weight: 700;
  color: #f1f5f9;
}

.stat-label {
  font-size: 11px;
  color: #64748b;
}

.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.badge-item {
  font-size: 11px;
  padding: 4px 10px;
  background: rgba(99, 102, 241, 0.15);
  color: #818cf8;
  border-radius: 10px;
}

.profile-actions {
  display: flex;
  gap: 12px;
}

.action-btn {
  flex: 1;
  padding: 12px;
  border-radius: 20px;
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;

  &.edit {
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: white;
  }

  &.share {
    background: rgba(255, 255, 255, 0.05);
    color: #e2e8f0;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  &:hover {
    transform: scale(1.02);
  }
}

.quick-settings {
  margin: 16px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.setting-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
}

.setting-icon {
  font-size: 18px;
}

.setting-name {
  flex: 1;
  font-size: 14px;
  color: #e2e8f0;
}

.switch {
  position: relative;
  width: 44px;
  height: 24px;

  input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 24px;
    transition: all 0.3s ease;

    &::before {
      position: absolute;
      content: "";
      height: 20px;
      width: 20px;
      left: 2px;
      bottom: 2px;
      background: white;
      border-radius: 50%;
      transition: all 0.3s ease;
    }
  }

  input:checked + .slider {
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  }

  input:checked + .slider::before {
    transform: translateX(20px);
  }
}

.menu-section {
  margin: 16px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  overflow: hidden;
}

.menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  cursor: pointer;
  transition: all 0.3s ease;

  &:last-child {
    border-bottom: none;
  }

  &:active {
    background: rgba(255, 255, 255, 0.03);
  }
}

.menu-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.menu-icon {
  font-size: 20px;
}

.menu-name {
  font-size: 14px;
  color: #e2e8f0;
}

.menu-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.menu-badge {
  background: #ef4444;
  color: white;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 10px;
}

.arrow {
  width: 20px;
  height: 20px;
  color: #64748b;
}

.content-section {
  margin: 16px;
  margin-top: 0;
}

.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.tab-btn {
  flex: 1;
  padding: 10px;
  background: rgba(255, 255, 255, 0.03);
  border: none;
  border-radius: 12px;
  color: #64748b;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  &.active {
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: white;
  }
}

.content-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}

.content-item {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 8px;
  cursor: pointer;
}

.content-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: all 0.3s ease;

  &:hover {
    transform: scale(1.05);
  }
}

.content-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 8px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transition: all 0.3s ease;

  svg {
    width: 14px;
    height: 14px;
    fill: #ef4444;
  }

  span {
    font-size: 12px;
    color: white;
  }
}

.content-item:hover .content-overlay {
  opacity: 1;
}

.logout-section {
  padding: 24px 16px;
  text-align: center;
}

.logout-btn {
  padding: 12px 48px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  color: #ef4444;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    background: rgba(239, 68, 68, 0.1);
    border-color: rgba(239, 68, 68, 0.3);
  }
}
</style>
