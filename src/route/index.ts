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
                path: '',
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
      }
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
    path: '/*',
    component: './Error',
  },
];

export default routes;
