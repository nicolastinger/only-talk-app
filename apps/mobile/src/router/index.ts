import { createRouter, createWebHistory } from "vue-router";
import type { RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
  {
    path: "/login",
    name: "Login",
    component: () => import("@/pages/Login/index.vue"),
  },
  {
    path: "/chats",
    name: "Chats",
    component: () => import("@/pages/Chats/index.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/chats/chat/:friendId",
    name: "Chat",
    component: () => import("@/pages/Chats/Chat/index.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/friends",
    name: "Friends",
    component: () => import("@/pages/Friends/index.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/friends/search",
    name: "SearchFriend",
    component: () => import("@/pages/Friends/SearchFriend.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/friends/detail/:friendId",
    name: "FriendDetail",
    component: () => import("@/pages/Friends/FriendDetail.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/moments",
    name: "Moments",
    component: () => import("@/pages/Moments/index.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/profile",
    name: "Profile",
    component: () => import("@/pages/Profile/index.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/",
    redirect: "/chats",
  },
  {
    path: "/:pathMatch(.*)*",
    redirect: "/chats",
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to, _from, next) => {
  // 登录页不需要验证，直接放行
  if (to.name === "Login") {
    // 如果已登录却访问登录页，重定向到主页
    if (sessionStorage.getItem("auth_flag")) {
      next({ name: "Chats" });
      return;
    }
    next();
    return;
  }

  if (to.meta.requiresAuth) {
    const flag = sessionStorage.getItem("auth_flag");
    if (!flag) {
      // 未登录，跳转到登录页
      next({ name: "Login", query: { redirect: to.fullPath } });
      return;
    }
  }

  next();
});

export default router;
