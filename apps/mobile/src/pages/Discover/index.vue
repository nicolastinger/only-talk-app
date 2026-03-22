<script setup lang="ts">
import { ref } from "vue";

interface Topic {
  id: number;
  title: string;
  participants: number;
  cover: string;
  color: string;
}

interface Channel {
  id: number;
  name: string;
  icon: string;
  description: string;
}

interface Activity {
  id: number;
  title: string;
  participants: number;
  time: string;
  image: string;
}

const searchQuery = ref("");

const hotTopics = ref<Topic[]>([
  {
    id: 1,
    title: "今日穿搭",
    participants: 12580,
    color: "#ff6b6b",
    cover: "",
  },
  { id: 2, title: "深夜食堂", participants: 8932, color: "#feca57", cover: "" },
  {
    id: 3,
    title: "游戏开黑",
    participants: 23456,
    color: "#48dbfb",
    cover: "",
  },
  {
    id: 4,
    title: "旅行达人",
    participants: 15678,
    color: "#1dd1a1",
    cover: "",
  },
]);

const channels = ref<Channel[]>([
  { id: 1, name: "音乐", icon: "🎵", description: "一起听歌" },
  { id: 2, name: "游戏", icon: "🎮", description: "开黑组队" },
  { id: 3, name: "美食", icon: "🍜", description: "深夜放毒" },
  { id: 4, name: "运动", icon: "⚽", description: "健身打卡" },
  { id: 5, name: "二次元", icon: "🎨", description: "追番聊番" },
  { id: 6, name: "学习", icon: "📚", description: "互相监督" },
]);

const activities = ref<Activity[]>([
  {
    id: 1,
    title: "周末桌游局",
    participants: 32,
    time: "周六 14:00",
    image: "https://picsum.photos/200/150?random=20",
  },
  {
    id: 2,
    title: "读书分享会",
    participants: 18,
    time: "周日 10:00",
    image: "https://picsum.photos/200/150?random=21",
  },
]);

const quickActions = [
  { id: 1, name: "语音匹配", icon: "🎙️", color: "#6366f1" },
  { id: 2, name: "灵魂测试", icon: "🔮", color: "#8b5cf6" },
  { id: 3, name: "兴趣星球", icon: "🌍", color: "#06b6d4" },
  { id: 4, name: "万人广场", icon: "📢", color: "#f59e0b" },
];
</script>

<template>
  <div class="discover-page">
    <div class="search-section">
      <div class="search-bar">
        <svg class="search-icon" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
          />
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索感兴趣的内容..."
          class="search-input"
        />
      </div>
    </div>

    <div class="quick-actions">
      <div
        v-for="action in quickActions"
        :key="action.id"
        class="quick-action-item"
        :style="{ '--action-color': action.color }"
      >
        <div class="action-icon">{{ action.icon }}</div>
        <span class="action-name">{{ action.name }}</span>
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <h2>热门话题</h2>
        <span class="more">更多</span>
      </div>
      <div class="topics-grid">
        <div
          v-for="topic in hotTopics"
          :key="topic.id"
          class="topic-card"
          :style="{ '--topic-color': topic.color }"
        >
          <div class="topic-icon">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M17.53 6.47l-2.12 1.41c-.26.17-.52.35-.79.53l-2.07-1.39-2.94 1.96c-.3-.19-.61-.37-.94-.53L6.5 7.46l-1.97 2.47c-.24-.09-.49-.17-.75-.24l1.42-2.12-2.12-1.41c-.26.17-.52.35-.79.53l-2.07-1.39L0 8.49c.26.17.52.35.79.53l2.07-1.39 2.94 1.96c.3-.19.61-.37.94-.53l2.07 1.39 1.97-2.47c.24.09.49.17.75.24l-1.42 2.12 2.12 1.41c.26-.17.52-.35.79-.53l2.07 1.39 2.94-1.96c.3.19.61.37.94.53l-2.07-1.39 1.97 2.47c.24-.09.49-.17.75-.24l-1.42-2.12z"
              />
            </svg>
          </div>
          <span class="topic-title">{{ topic.title }}</span>
          <span class="topic-count"
            >{{ (topic.participants / 10000).toFixed(1) }}万参与</span
          >
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <h2>兴趣频道</h2>
        <span class="more">全部</span>
      </div>
      <div class="channels-grid">
        <div v-for="channel in channels" :key="channel.id" class="channel-card">
          <span class="channel-icon">{{ channel.icon }}</span>
          <span class="channel-name">{{ channel.name }}</span>
          <span class="channel-desc">{{ channel.description }}</span>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <h2>正在进行的活动</h2>
        <span class="more">查看更多</span>
      </div>
      <div class="activities-list">
        <div
          v-for="activity in activities"
          :key="activity.id"
          class="activity-card"
        >
          <img
            :src="activity.image"
            :alt="activity.title"
            class="activity-image"
          />
          <div class="activity-info">
            <h3 class="activity-title">{{ activity.title }}</h3>
            <div class="activity-meta">
              <span class="meta-item">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
                  />
                </svg>
                {{ activity.participants }}人参与
              </span>
              <span class="meta-item">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"
                  />
                </svg>
                {{ activity.time }}
              </span>
            </div>
            <button class="join-btn">立即参与</button>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <h2>趣味测试</h2>
      </div>
      <div class="test-banner">
        <div class="test-content">
          <span class="test-emoji">🧩</span>
          <div class="test-info">
            <h3>测测你的灵魂颜色</h3>
            <p>已有 123,456 人参与</p>
          </div>
        </div>
        <button class="test-btn">开始测试</button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.discover-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #0f0f23 0%, #1a1a2e 100%);
  padding: 16px;
  padding-bottom: 80px;
}

.search-section {
  margin-bottom: 16px;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  padding: 12px 16px;
  transition: all 0.3s ease;

  &:focus-within {
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
  }
}

.search-icon {
  width: 20px;
  height: 20px;
  color: #64748b;
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #f1f5f9;
  font-size: 14px;

  &::placeholder {
    color: #64748b;
  }
}

.quick-actions {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 24px;
}

.quick-action-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: rgba(var(--action-color-rgb), 0.1);
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.action-icon {
  font-size: 24px;
}

.action-name {
  font-size: 12px;
  color: #e2e8f0;
}

.section {
  margin-bottom: 24px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;

  h2 {
    font-size: 16px;
    font-weight: 600;
    color: #f1f5f9;
    margin: 0;
  }

  .more {
    font-size: 12px;
    color: #64748b;
    cursor: pointer;

    &:hover {
      color: #6366f1;
    }
  }
}

.topics-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.topic-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  background: rgba(var(--topic-color-rgb), 0.1);
  border-radius: 14px;
  border: 1px solid rgba(var(--topic-color-rgb), 0.2);
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
  }
}

.topic-icon {
  width: 28px;
  height: 28px;
  color: var(--topic-color);
}

.topic-title {
  font-size: 14px;
  font-weight: 600;
  color: #f1f5f9;
}

.topic-count {
  font-size: 11px;
  color: #64748b;
}

.channels-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.channel-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    background: rgba(99, 102, 241, 0.1);
    border-color: rgba(99, 102, 241, 0.3);
  }
}

.channel-icon {
  font-size: 28px;
}

.channel-name {
  font-size: 13px;
  font-weight: 600;
  color: #f1f5f9;
}

.channel-desc {
  font-size: 11px;
  color: #64748b;
}

.activities-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.activity-card {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.activity-image {
  width: 80px;
  height: 60px;
  border-radius: 10px;
  object-fit: cover;
}

.activity-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.activity-title {
  font-size: 14px;
  font-weight: 600;
  color: #f1f5f9;
  margin: 0;
}

.activity-meta {
  display: flex;
  gap: 12px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #64748b;

  svg {
    width: 14px;
    height: 14px;
  }
}

.join-btn {
  align-self: flex-start;
  padding: 6px 16px;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: white;
  border: none;
  border-radius: 14px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
  }
}

.test-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: linear-gradient(
    135deg,
    rgba(99, 102, 241, 0.2) 0%,
    rgba(139, 92, 246, 0.2) 100%
  );
  border-radius: 16px;
  border: 1px solid rgba(99, 102, 241, 0.3);
}

.test-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.test-emoji {
  font-size: 36px;
}

.test-info {
  h3 {
    font-size: 15px;
    font-weight: 600;
    color: #f1f5f9;
    margin: 0 0 4px 0;
  }

  p {
    font-size: 12px;
    color: #64748b;
    margin: 0;
  }
}

.test-btn {
  padding: 10px 20px;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: white;
  border: none;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
  }
}
</style>
