const routes = [
  {
    path: '/',
    component: '@/layouts/RootLayout',
    routes: [
      {
        path: '/',
        redirect: '/signIn',
      },
      {
        name: 'menu.fakeHome',
        path: '/fakeHome',
        component: '@/layouts/FakeLayout',
        routes: [
          {
            path: '/fakeHome',
            redirect: '/fakeHome/settings',
          },
          {
            name: 'menu.settings',
            path: '/fakeHome/settings',
            component: './Home/Settings',
          },
        ],
      },
      {
        name: 'menu.home',
        path: '/home',
        component: '@/layouts/HomeLayout',
        routes: [
          {
            path: '/home',
            redirect: '/home/chats',
          },
          {
            name: 'menu.settings',
            path: '/home/settings',
            component: './Home/Settings',
          },
          {
            name: 'menu.chats',
            path: 'chats',
            component: '@/layouts/HomeLayout/ChatsLayout',
            routes: [
              {
                path: '',
                redirect: 'dashboard',
              },
              {
                name: 'menu.chats.chat',
                path: 'chat',
                component: './Home/Chats/Chat',
              },
              {
                name: 'menu.chats.self-chat',
                path: 'self-chat',
                component: './Home/Chats/SelfChat',
              },
              {
                name: 'menu.chats.dashboard',
                path: 'dashboard',
                component: './Home/Chats/Dashboard',
              },
              {
                name: 'menu.chats.groupChat',
                path: 'group-chat',
                component: './Home/Chats/GroupChat',
              },
              {
                name: 'menu.chats.groupInfo',
                path: 'group-info',
                component: './Home/Chats/GroupInfo',
              },
              {
                name: 'menu.chats.groupSettings',
                path: 'group-settings',
                component: './Home/Chats/GroupSettings',
              },
            ],
          },
          {
            name: 'menu.contacts',
            path: 'contacts',
            component: '@/layouts/HomeLayout/ContactsLayout',
            routes: [
              {
                path: '',
                redirect: 'dashboard',
              },
              {
                name: 'menu.contacts.dashboard',
                path: 'dashboard',
                component: './Home/Contacts/components/Dashboard',
              },
              {
                name: 'menu.contacts.friend',
                path: 'friend',
                component: './Home/Contacts',
              },
              {
                name: 'menu.contacts.group',
                path: 'group',
                component: './Home/Contacts/GroupInfo',
              },
            ],
          },
        ],
      },
      {
        name: 'menu.access',
        path: '/access',
        component: './Access',
      },
      {
        name: 'menu.signIn',
        path: '/signIn',
        component: './Sign/SignIn',
      },
      {
        name: 'menu.signUp',
        path: '/signUp',
        component: './Sign/SignUp',
      },
      {
        name: 'menu.testComponent',
        path: '/testComponent',
        component: './TestComponent',
      },
    ],
  },
  {
    path: '/media/handler',
    component: './Media/Handler',
  },
  {
    path: '/media/videoCall',
    component: './Media/VideoCall',
  },
  {
    path: '/search/friend',
    component: './Search/Friend',
  },
  {
    path: '/imagePreview',
    component: './ImagePreview',
  },
  {
    path: '/privacy/chat',
    component: './Privacy/Chat',
  },
  {
    path: '/webrtc/chat',
    component: './WebRTC/Chat',
  },
  {
    path: '/*',
    component: './Error',
  },
];

export default routes;
