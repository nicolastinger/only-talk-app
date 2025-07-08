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
        name: 'menu.home',
        path: '/home',
        component: '@/layouts/HomeLayout',
        routes: [
          {
            path: '/home',
            redirect: '/home/chats',
          },
          {
            name: 'menu.chats',
            path: 'chats',
            component: '@/layouts/HomeLayout/ChatsLayout',
            routes: [
              {
                path: 'chats',
                redirect: 'dashboard',
              },
              {
                name: 'menu.chats.chat',
                path: 'chat',
                component: './Home/Chats/Chat',
              },
              {
                name: 'menu.chats.dashboard',
                path: 'dashboard',
                component: './Home/Chats/Dashboard',
              },
              {
                path: 'contacts',
                component: './Home/Contacts',
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
    path: '/*',
    component: './Error',
  },
];

export default routes;
