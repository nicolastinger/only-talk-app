<script setup lang="ts">
import { ref } from "vue";

interface RecommendUser {
  id: number;
  avatar: string;
  name: string;
  age: number;
  gender: string;
  bio: string;
  tags: string[];
  distance: string;
  online: boolean;
  matchRate: number;
}

const categories = ["全部", "附近", "新入驻", "高匹配", "有趣"];
const activeCategory = ref(0);

const recommendUsers = ref<RecommendUser[]>([
  {
    id: 1,
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=10",
    name: "小鹿",
    age: 22,
    gender: "女",
    bio: "喜欢音乐和旅行的文艺少女🎨",
    tags: ["音乐", "旅行", "摄影"],
    distance: "2.5km",
    online: true,
    matchRate: 95,
  },
  {
    id: 2,
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=11",
    name: "阿伟",
    age: 24,
    gender: "男",
    bio: "健身爱好者，日常打卡健身房💪",
    tags: ["健身", "篮球", "游戏"],
    distance: "5.1km",
    online: true,
    matchRate: 88,
  },
  {
    id: 3,
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=12",
    name: "糖糖",
    age: 20,
    gender: "女",
    bio: "甜品控，喜欢烘焙和猫咪🐱",
    tags: ["烘焙", "猫咪", "美食"],
    distance: "8.3km",
    online: false,
    matchRate: 92,
  },
  {
    id: 4,
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=13",
    name: "Leo",
    age: 26,
    gender: "男",
    bio: "程序员，热爱开源和咖啡☕",
    tags: ["编程", "咖啡", "科技"],
    distance: "12km",
    online: true,
    matchRate: 85,
  },
  {
    id: 5,
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=14",
    name: "小鱼",
    age: 23,
    gender: "女",
    bio: "二次元少女，追番ing📺",
    tags: ["二次元", "追番", "画画"],
    distance: "3.7km",
    online: true,
    matchRate: 90,
  },
  {
    id: 6,
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=15",
    name: "石头",
    age: 25,
    gender: "男",
    bio: "户外徒步爱好者，周末常去爬山🏔️",
    tags: ["徒步", "摄影", "自然"],
    distance: "6.2km",
    online: false,
    matchRate: 78,
  },
]);

const selectCategory = (index: number) => {
  activeCategory.value = index;
};

const getMatchColor = (rate: number) => {
  if (rate >= 90) return "#22c55e";
  if (rate >= 80) return "#6366f1";
  return "#f59e0b";
};
</script>

<template>
  <div class="recommend-page">
    <div class="header">
      <h1>推荐</h1>
      <p>发现志同道合的朋友</p>
    </div>

    <div class="categories">
      <button
        v-for="(category, index) in categories"
        :key="category"
        class="category-btn"
        :class="{ active: activeCategory === index }"
        @click="selectCategory(index)"
      >
        {{ category }}
      </button>
    </div>

    <div class="users-grid">
      <div v-for="user in recommendUsers" :key="user.id" class="user-card">
        <div class="card-header">
          <div class="avatar-wrapper">
            <img :src="user.avatar" :alt="user.name" class="avatar" />
            <span v-if="user.online" class="online-dot"></span>
          </div>
          <div
            class="match-badge"
            :style="{ background: getMatchColor(user.matchRate) }"
          >
            {{ user.matchRate }}%
          </div>
        </div>

        <div class="card-body">
          <h3 class="user-name">
            {{ user.name }}
            <span class="user-age">{{ user.age }}</span>
          </h3>
          <p class="user-bio">{{ user.bio }}</p>
          <div class="user-tags">
            <span v-for="tag in user.tags" :key="tag" class="tag">{{
              tag
            }}</span>
          </div>
          <div class="user-footer">
            <span class="distance">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="C12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
                />
              </svg>
              {{ user.distance }}
            </span>
            <span class="gender">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                />
              </svg>
              {{ user.gender === "男" ? "♂" : "♀" }}
            </span>
          </div>
        </div>

        <div class="card-actions">
          <button class="action-btn pass">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
              />
            </svg>
          </button>
          <button class="action-btn like">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <div class="loading-hint">
      <span>上滑查看更多</span>
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
      </svg>
    </div>
  </div>
</template>

<style scoped lang="less">
.recommend-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #0f0f23 0%, #1a1a2e 100%);
  padding: 16px;
  padding-bottom: 80px;
}

.header {
  text-align: center;
  margin-bottom: 20px;

  h1 {
    font-size: 24px;
    font-weight: 700;
    color: #f1f5f9;
    margin: 0 0 4px 0;
  }

  p {
    font-size: 13px;
    color: #64748b;
    margin: 0;
  }
}

.categories {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 8px 0;
  margin-bottom: 16px;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.category-btn {
  flex-shrink: 0;
  padding: 8px 16px;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.03);
  color: #94a3b8;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    background: rgba(99, 102, 241, 0.1);
    border-color: rgba(99, 102, 241, 0.3);
  }

  &.active {
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: white;
    border-color: transparent;
    box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
  }
}

.users-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.user-card {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.05);
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
  }
}

.card-header {
  position: relative;
  padding: 16px;
  padding-bottom: 8px;
}

.avatar-wrapper {
  position: relative;
  display: flex;
  justify-content: center;
}

.avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  border: 3px solid rgba(99, 102, 241, 0.3);
}

.online-dot {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(20px);
  width: 16px;
  height: 16px;
  background: #22c55e;
  border: 3px solid #1a1a2e;
  border-radius: 50%;
}

.match-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  color: white;
}

.card-body {
  padding: 0 16px 16px;
}

.user-name {
  font-size: 16px;
  font-weight: 600;
  color: #f1f5f9;
  margin: 0 0 4px 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.user-age {
  font-size: 12px;
  color: #64748b;
  font-weight: 400;
}

.user-bio {
  font-size: 12px;
  color: #94a3b8;
  margin: 0 0 10px 0;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.user-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 10px;
}

.tag {
  font-size: 10px;
  padding: 3px 8px;
  background: rgba(99, 102, 241, 0.15);
  color: #818cf8;
  border-radius: 8px;
}

.user-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.distance,
.gender {
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

.card-actions {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  transition: all 0.3s ease;

  svg {
    width: 20px;
    height: 20px;
  }

  &.pass {
    background: rgba(255, 255, 255, 0.05);
    color: #64748b;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
      transform: scale(1.05);
    }
  }

  &.like {
    background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
    color: white;

    &:hover {
      transform: scale(1.05);
      box-shadow: 0 4px 15px rgba(239, 68, 68, 0.4);
    }
  }
}

.loading-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px;
  color: #64748b;
  font-size: 12px;

  svg {
    width: 20px;
    height: 20px;
    animation: bounce 1s infinite;
  }
}

@keyframes bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(5px);
  }
}
</style>
