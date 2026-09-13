import { createRouter, createWebHistory } from "vue-router";
import type { RouteRecordRaw } from "vue-router";
import { isSupportedLocale, locale, messages, setLocale } from "@/i18n";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "home",
    component: () => import("@/pages/Home/index.vue"),
  },
  {
    path: "/download",
    name: "download",
    component: () => import("@/pages/Download/index.vue"),
  },
  {
    path: "/privacy",
    name: "privacy",
    component: () => import("@/pages/Privacy/index.vue"),
  },
  {
    path: "/agreement",
    name: "agreement",
    component: () => import("@/pages/Agreement/index.vue"),
  },
  {
    path: "/:pathMatch(.*)*",
    redirect: "/",
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    }
    if (to.hash) {
      return { el: to.hash, top: 80 };
    }
    return { top: 0 };
  },
});

router.afterEach((to) => {
  const lang = to.query.lang;
  if (isSupportedLocale(lang)) {
    setLocale(lang);
  }
  const title =
    messages[locale.value].meta[
      to.name as keyof (typeof messages)[typeof locale.value]["meta"]
    ];
  document.title = title ?? "Only Talk";
});

export default router;
