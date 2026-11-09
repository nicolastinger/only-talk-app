import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
import RootLayout from '@/layouts/RootLayout.vue';

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
            component: () => import('@/pages/Home/Settings/index.vue'),
            meta: { title: '设置' },
          },
          {
            path: 'chats',
            component: () =>
              import('@/layouts/HomeLayout/ChatsLayout/index.vue'),
            children: [
              {
                path: '',
                redirect: 'dashboard',
              },
              {
                path: 'chat',
                name: 'Chat',
                component: () => import('@/pages/Home/Chats/Chat/index.vue'),
                meta: { title: '聊天' },
              },
              {
                path: 'self-chat',
                name: 'SelfChat',
                component: () =>
                  import('@/pages/Home/Chats/SelfChat/index.vue'),
                meta: { title: '笔记' },
              },
              {
                path: 'dashboard',
                name: 'ChatsDashboard',
                component: () =>
                  import('@/pages/Home/Chats/Dashboard/index.vue'),
                meta: { title: '会话' },
              },
              {
                path: 'group-chat',
                name: 'GroupChat',
                component: () =>
                  import('@/pages/Home/Chats/GroupChat/index.vue'),
                meta: { title: '群聊' },
              },
              {
                path: 'group-info',
                name: 'GroupInfo',
                component: () =>
                  import('@/pages/Home/Chats/GroupInfo/index.vue'),
                meta: { title: '群聊信息' },
              },
              {
                path: 'group-settings',
                name: 'GroupSettings',
                component: () =>
                  import('@/pages/Home/Chats/GroupSettings/index.vue'),
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
                component: () =>
                  import('@/pages/Home/Contacts/components/Dashboard.vue'),
                meta: { title: '联系人' },
              },
              {
                path: 'friend',
                name: 'ContactFriend',
                component: () => import('@/pages/Home/Contacts/index.vue'),
                meta: { title: '好友信息' },
              },
              {
                path: 'group',
                name: 'ContactGroup',
                component: () => import('@/pages/Home/Contacts/GroupInfo.vue'),
                meta: { title: '群组信息' },
              },
            ],
          },
          {
            path: 'plaza',
            name: 'Plaza',
            component: () =>
              import('@/layouts/HomeLayout/PlazaLayout/index.vue'),
            meta: { title: '交友广场' },
          },
          {
            path: 'plaza/user/:uuid',
            name: 'PlazaUserMoments',
            component: () =>
              import('@/pages/Home/Plaza/UserMoments/index.vue'),
            meta: { title: '用户动态' },
          },
          {
            path: 'moments',
            name: 'Moments',
            component: () => import('@/pages/Home/Moments/index.vue'),
            meta: { title: '动态' },
          },
          {
            path: 'moments/:id',
            name: 'MomentDetail',
            component: () => import('@/pages/Home/Moments/Detail/index.vue'),
            meta: { title: '动态详情' },
          },
        ],
      },
      {
        path: 'access',
        name: 'Access',
        component: () => import('@/pages/Access/index.vue'),
        meta: { title: '权限演示' },
      },
      {
        path: 'signIn',
        name: 'SignIn',
        component: () => import('@/pages/Sign/SignIn/index.vue'),
        meta: { title: '登录' },
      },
      {
        path: 'signUp',
        name: 'SignUp',
        component: () => import('@/pages/Sign/SignUp/index.vue'),
        meta: { title: '注册' },
      },
      {
        path: 'forgotPassword',
        name: 'ForgotPassword',
        component: () => import('@/pages/Sign/ForgotPassword/index.vue'),
        meta: { title: '找回密码' },
      },
      {
        path: 'testComponent',
        name: 'TestComponent',
        component: () => import('@/pages/TestComponent/index.vue'),
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
    component: () => import('@/pages/Media/Handler/index.vue'),
    meta: { title: '音视频处理' },
  },
  {
    path: '/media/videoCall',
    name: 'MediaVideoCall',
    component: () => import('@/pages/Media/VideoCall/index.vue'),
    meta: { title: '视频通话' },
  },
  {
    path: '/search/friend',
    name: 'SearchFriend',
    component: () => import('@/pages/Search/Friend/index.vue'),
    meta: { title: '添加好友' },
  },
  {
    path: '/imagePreview',
    name: 'ImagePreviewPage',
    component: () => import('@/pages/ImagePreview/index.vue'),
    meta: { title: '图片预览' },
  },
  {
    path: '/privacy/chat',
    name: 'PrivacyChat',
    component: () => import('@/pages/Privacy/Chat/index.vue'),
    meta: { title: '隐私聊天' },
  },
  {
    path: '/webrtc/chat',
    name: 'WebRTCChat',
    component: () => import('@/pages/WebRTC/Chat/index.vue'),
    meta: { title: '视频聊天' },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
