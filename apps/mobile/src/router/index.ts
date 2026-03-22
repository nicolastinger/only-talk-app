import { createRouter, createWebHistory } from "vue-router";
import type { RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "Home",
    component: () => import("@/pages/Home/index.vue"),
  },
  {
    path: "/recommend",
    name: "Recommend",
    component: () => import("@/pages/Recommend/index.vue"),
  },
  {
    path: "/discover",
    name: "Discover",
    component: () => import("@/pages/Discover/index.vue"),
  },
  {
    path: "/profile",
    name: "Profile",
    component: () => import("@/pages/Profile/index.vue"),
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
