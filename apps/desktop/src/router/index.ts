import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
import RootLayout from '@/layouts/RootLayout.vue';

/**
 * 迁移期占位组件：页面逐个落地后替换为真实懒加载组件。
 * 保持路由结构和 Umi 版本一致，便于增量迁移。
 */
const placeholder = () => import('@/components/PagePlaceholder.vue');
const nestedPlaceholder = () => import('@/components/NestedPlaceholder.vue');

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: RootLayout,
    children: [
      {
        path: '',
        redirect: '/signIn',
      },
      {
        path: 'home',
        component: () => import('@/layouts/HomeLayout/index.vue'),
        children: [
          {
            path: '',
            redirect: '/home/chats',
          },
          {
            path: 'settings',
            name: 'Settings',
            component: placeholder,
            meta: { title: '设置' },
          },
          {
            path: 'chats',
            component: () => import('@/layouts/HomeLayout/ChatsLayout/index.vue'),
            children: [
              {
                path: '',
                redirect: 'dashboard',
              },
              {
                path: 'chat',
                name: 'Chat',
                component: placeholder,
                meta: { title: '聊天' },
              },
              {
                path: 'self-chat',
                name: 'SelfChat',
                component: placeholder,
                meta: { title: '笔记' },
              },
              {
                path: 'dashboard',
                name: 'ChatsDashboard',
                component: placeholder,
                meta: { title: '会话' },
              },
              {
                path: 'group-chat',
                name: 'GroupChat',
                component: placeholder,
                meta: { title: '群聊' },
              },
              {
                path: 'group-info',
                name: 'GroupInfo',
                component: placeholder,
                meta: { title: '群聊信息' },
              },
              {
                path: 'group-settings',
                name: 'GroupSettings',
                component: placeholder,
                meta: { title: '群聊设置' },
              },
            ],
          },
          {
            path: 'contacts',
            component: () =>
              import('@/layouts/HomeLayout/ContactsLayout/index.vue'),
            children: [
              {
                path: '',
                redirect: 'dashboard',
              },
              {
                path: 'dashboard',
                name: 'ContactsDashboard',
                component: placeholder,
                meta: { title: '联系人' },
              },
              {
                path: 'friend',
                name: 'ContactFriend',
                component: placeholder,
                meta: { title: '好友信息' },
              },
              {
                path: 'group',
                name: 'ContactGroup',
                component: placeholder,
                meta: { title: '群组信息' },
              },
            ],
          },
          {
            path: 'plaza',
            name: 'Plaza',
            component: () => import('@/layouts/HomeLayout/PlazaLayout/index.vue'),
            meta: { title: '交友广场' },
          },
          {
            path: 'plaza/user/:uuid',
            name: 'PlazaUserMoments',
            component: placeholder,
            meta: { title: '用户动态' },
          },
          {
            path: 'moments',
            name: 'Moments',
            component: placeholder,
            meta: { title: '动态' },
          },
          {
            path: 'moments/:id',
            name: 'MomentDetail',
            component: placeholder,
            meta: { title: '动态详情' },
          },
        ],
      },
      {
        path: 'access',
        name: 'Access',
        component: placeholder,
        meta: { title: '权限演示' },
      },
      {
        path: 'signIn',
        name: 'SignIn',
        component: placeholder,
        meta: { title: '登录' },
      },
      {
        path: 'signUp',
        name: 'SignUp',
        component: placeholder,
        meta: { title: '注册' },
      },
      {
        path: 'forgotPassword',
        name: 'ForgotPassword',
        component: placeholder,
        meta: { title: '找回密码' },
      },
      {
        path: 'testComponent',
        name: 'TestComponent',
        component: placeholder,
        meta: { title: '组件测试' },
      },
      {
        path: ':pathMatch(.*)*',
        name: 'NotFound',
        component: () => import('@/pages/Error/index.vue'),
      },
    ],
  },
  // 独立窗口路由（不经过 RootLayout，与 Umi 版本保持一致）
  {
    path: '/media/handler',
    name: 'MediaHandler',
    component: placeholder,
    meta: { title: '音视频处理' },
  },
  {
    path: '/media/videoCall',
    name: 'MediaVideoCall',
    component: placeholder,
    meta: { title: '视频通话' },
  },
  {
    path: '/search/friend',
    name: 'SearchFriend',
    component: placeholder,
    meta: { title: '添加好友' },
  },
  {
    path: '/imagePreview',
    name: 'ImagePreviewPage',
    component: placeholder,
    meta: { title: '图片预览' },
  },
  {
    path: '/privacy/chat',
    name: 'PrivacyChat',
    component: placeholder,
    meta: { title: '隐私聊天' },
  },
  {
    path: '/webrtc/chat',
    name: 'WebRTCChat',
    component: placeholder,
    meta: { title: '视频聊天' },
  },
];

// 保留 nestedPlaceholder 导出，后续替换父子布局时可复用
void nestedPlaceholder;

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
