import { createRouter, createWebHistory } from "vue-router";
import type { RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
  {
    path: "/login",
    name: "Login",
    component: () => import("@/pages/Login/index.vue"),
  },
  {
    path: "/signup",
    name: "SignUp",
    component: () => import("@/pages/SignUp/index.vue"),
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
    path: "/chats/group-chat/:groupId",
    name: "GroupChat",
    component: () => import("@/pages/Chats/GroupChat/index.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/chats/group-settings/:groupId",
    name: "GroupSettings",
    component: () => import("@/pages/Chats/GroupSettings.vue"),
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
    path: "/friends/requests",
    name: "FriendRequests",
    component: () => import("@/pages/Friends/Requests.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/friends/group-requests",
    name: "GroupInvitations",
    component: () => import("@/pages/Friends/GroupInvitations.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/friends/create-group",
    name: "CreateGroup",
    component: () => import("@/pages/Friends/CreateGroup.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/plaza",
    name: "Plaza",
    component: () => import("@/pages/Plaza/index.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/plaza/moment/create",
    name: "MomentCreate",
    component: () => import("@/pages/Plaza/feed/MomentComposer.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/plaza/moment/:id",
    name: "MomentDetail",
    component: () => import("@/pages/Plaza/feed/MomentDetail.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/notifications",
    name: "Notifications",
    component: () => import("@/pages/Notifications/index.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/profile",
    name: "Profile",
    component: () => import("@/pages/Profile/index.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/profile/edit",
    name: "EditProfile",
    component: () => import("@/pages/Profile/EditProfile.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/settings",
    component: () => import("@/pages/Settings/_layout.vue"),
    meta: { requiresAuth: true },
    children: [
      {
        path: "",
        name: "Settings",
        component: () => import("@/pages/Settings/index.vue"),
      },
      {
        path: "general",
        name: "SettingsGeneral",
        component: () => import("@/pages/Settings/General.vue"),
      },
      {
        path: "notification",
        name: "SettingsNotification",
        component: () => import("@/pages/Settings/Notification.vue"),
      },
      {
        path: "account",
        name: "SettingsAccount",
        component: () => import("@/pages/Settings/Account.vue"),
      },
      {
        path: "blacklist",
        name: "SettingsBlacklist",
        component: () => import("@/pages/Settings/BlackList.vue"),
      },
      {
        path: "plaza",
        name: "SettingsPlaza",
        component: () => import("@/pages/Settings/Plaza.vue"),
      },
      {
        path: "about",
        name: "SettingsAbout",
        component: () => import("@/pages/Settings/About.vue"),
      },
    ],
  },
  {
    path: "/call",
    name: "Call",
    component: () => import("@/pages/Call/index.vue"),
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
