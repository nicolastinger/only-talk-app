<script setup lang="ts">
import { ref } from "vue";

interface Story {
  id: number;
  avatar: string;
  name: string;
  online: boolean;
}

interface Post {
  id: number;
  userId: number;
  userName: string;
  userAvatar: string;
  content: string;
  images: string[];
  likes: number;
  comments: number;
  time: string;
  tags: string[];
  isLiked: boolean;
}

const stories = ref<Story[]>([
  {
    id: 1,
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=1",
    name: "我的",
    online: true,
  },
  {
    id: 2,
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=2",
    name: "小糖",
    online: true,
  },
  {
    id: 3,
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=3",
    name: "阿杰",
    online: false,
  },
  {
    id: 4,
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=4",
    name: "喵喵",
    online: true,
  },
  {
    id: 5,
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=5",
    name: "星仔",
    online: true,
  },
  {
    id: 6,
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=6",
    name: "小酒",
    online: false,
  },
]);

const posts = ref<Post[]>([
  {
    id: 1,
    userId: 101,
    userName: "元气少女小糖",
    userAvatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=2",
    content: "今天天气超级好！出门晒太阳啦～☀️ #好心情 #周末",
    images: [
      "https://picsum.photos/400/300?random=1",
      "https://picsum.photos/400/300?random=2",
    ],
    likes: 234,
    comments: 45,
    time: "10分钟前",
    tags: ["好心情", "周末"],
    isLiked: false,
  },
  {
    id: 2,
    userId: 102,
    userName: "程序猿阿杰",
    userAvatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=3",
    content: "刚刚写完一个酷炫的动画效果，代码真的可以很美！💻✨",
    images: [],
    likes: 567,
    comments: 89,
    time: "30分钟前",
    tags: ["编程", "代码之美"],
    isLiked: true,
  },
  {
    id: 3,
    userId: 103,
    userName: "音乐人喵喵",
    userAvatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=4",
    content: "新歌demo完成了！给大家听听看怎么样🎵",
    images: ["https://picsum.photos/400/300?random=3"],
    likes: 892,
    comments: 156,
    time: "1小时前",
    tags: ["音乐", "原创"],
    isLiked: false,
  },
  {
    id: 4,
    userId: 104,
    userName: "旅行达人星仔",
    userAvatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=5",
    content: "西藏的星空，太震撼了！肉眼可见的银河🌌",
    images: [
      "https://picsum.photos/400/300?random=4",
      "https://picsum.photos/400/300?random=5",
      "https://picsum.photos/400/300?random=6",
    ],
    likes: 1203,
    comments: 234,
    time: "2小时前",
    tags: ["旅行", "星空"],
    isLiked: false,
  },
]);

const toggleLike = (postId: number) => {
  const post = posts.value.find((p) => p.id === postId);
  if (post) {
    post.isLiked = !post.isLiked;
    post.likes += post.isLiked ? 1 : -1;
  }
};
</script>

<template>
  <div class="home-page">
    <div class="header">
      <div class="header-left">
        <img
          class="user-avatar"
          src="https://api.dicebear.com/7.x/avataaars/svg?seed=1"
          alt="avatar"
        />
        <div class="online-badge">
          <span class="dot"></span>
          <span>在线</span>
        </div>
      </div>
      <div class="header-right">
        <div class="search-icon">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
            />
          </svg>
        </div>
        <div class="msg-icon">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"
            />
          </svg>
          <span class="msg-badge">5</span>
        </div>
      </div>
    </div>

    <div class="stories-section">
      <div class="stories-scroll">
        <div v-for="story in stories" :key="story.id" class="story-item">
          <div class="story-avatar-wrapper" :class="{ online: story.online }">
            <img :src="story.avatar" :alt="story.name" class="story-avatar" />
          </div>
          <span class="story-name">{{ story.name }}</span>
        </div>
      </div>
    </div>

    <div class="feed-section">
      <div v-for="post in posts" :key="post.id" class="post-card">
        <div class="post-header">
          <img
            :src="post.userAvatar"
            :alt="post.userName"
            class="post-avatar"
          />
          <div class="post-user-info">
            <span class="post-user-name">{{ post.userName }}</span>
            <span class="post-time">{{ post.time }}</span>
          </div>
          <button class="follow-btn">+ 关注</button>
        </div>

        <div class="post-content">
          <p>{{ post.content }}</p>
          <div class="post-tags">
            <span v-for="tag in post.tags" :key="tag" class="tag"
              >#{{ tag }}</span
            >
          </div>
        </div>

        <div
          v-if="post.images.length > 0"
          class="post-images"
          :class="{ multi: post.images.length > 1 }"
        >
          <img
            v-for="(img, index) in post.images"
            :key="index"
            :src="img"
            alt="post image"
            class="post-image"
          />
        </div>

        <div class="post-actions">
          <button
            class="action-btn"
            :class="{ liked: post.isLiked }"
            @click="toggleLike(post.id)"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
              />
            </svg>
            <span>{{ post.likes }}</span>
          </button>
          <button class="action-btn">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18zM18 14H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"
              />
            </svg>
            <span>{{ post.comments }}</span>
          </button>
          <button class="action-btn">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"
              />
            </svg>
            <span>分享</span>
          </button>
        </div>
      </div>
    </div>

    <div class="fab">
      <svg viewBox="0 0 24 24" fill="white">
        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
      </svg>
    </div>
  </div>
</template>

<style scoped lang="less">
.home-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%);
  padding-bottom: 70px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: transparent;
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(10px);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid rgba(99, 102, 241, 0.5);
}

.online-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #22c55e;
  background: rgba(34, 197, 94, 0.15);
  padding: 4px 8px;
  border-radius: 10px;
}

.dot {
  width: 6px;
  height: 6px;
  background: #22c55e;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.header-right {
  display: flex;
  gap: 16px;
}

.search-icon,
.msg-icon {
  width: 24px;
  height: 24px;
  color: #e2e8f0;
  cursor: pointer;
  position: relative;
}

.msg-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #ef4444;
  color: white;
  font-size: 10px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stories-section {
  padding: 12px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.stories-scroll {
  display: flex;
  gap: 16px;
  padding: 0 16px;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.story-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.story-avatar-wrapper {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  padding: 3px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  position: relative;

  &.online::after {
    content: "";
    position: absolute;
    bottom: 2px;
    right: 2px;
    width: 14px;
    height: 14px;
    background: #22c55e;
    border: 2px solid #0f0f23;
    border-radius: 50%;
  }
}

.story-avatar {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: #1a1a2e;
  object-fit: cover;
}

.story-name {
  font-size: 11px;
  color: #94a3b8;
  max-width: 56px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feed-section {
  padding: 16px;
}

.post-card {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 16px;
  padding: 16px;
  margin-bottom: 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  transition: all 0.3s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }
}

.post-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.post-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
}

.post-user-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.post-user-name {
  font-size: 15px;
  font-weight: 600;
  color: #f1f5f9;
}

.post-time {
  font-size: 12px;
  color: #64748b;
}

.follow-btn {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: white;
  border: none;
  padding: 6px 14px;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
  }
}

.post-content {
  margin-bottom: 12px;

  p {
    font-size: 14px;
    color: #e2e8f0;
    line-height: 1.6;
    margin: 0 0 8px 0;
  }
}

.post-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag {
  color: #818cf8;
  font-size: 13px;
}

.post-images {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;

  &.multi {
    grid-template-columns: repeat(2, 1fr);
  }
}

.post-image {
  width: 100%;
  height: 150px;
  object-fit: cover;
  border-radius: 12px;
  transition: all 0.3s ease;

  &:hover {
    transform: scale(1.02);
  }
}

.post-actions {
  display: flex;
  justify-content: space-around;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  color: #64748b;
  font-size: 13px;
  cursor: pointer;
  padding: 8px 16px;
  border-radius: 20px;
  transition: all 0.3s ease;

  svg {
    width: 20px;
    height: 20px;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  &.liked {
    color: #ef4444;

    svg {
      fill: #ef4444;
      animation: heartBeat 0.3s ease;
    }
  }
}

@keyframes heartBeat {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.2);
  }
}

.fab {
  position: fixed;
  bottom: 80px;
  right: 20px;
  width: 56px;
  height: 56px;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 20px rgba(99, 102, 241, 0.5);
  cursor: pointer;
  transition: all 0.3s ease;
  z-index: 100;

  svg {
    width: 28px;
    height: 28px;
  }

  &:hover {
    transform: scale(1.1);
    box-shadow: 0 6px 25px rgba(99, 102, 241, 0.6);
  }

  &:active {
    transform: scale(0.95);
  }
}
</style>
