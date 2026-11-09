import { defaultWindowIcon } from '@tauri-apps/api/app';
import { Menu } from '@tauri-apps/api/menu';
import { TrayIcon } from '@tauri-apps/api/tray';

const setupTrayIcon = async () => {
  const icon = (await defaultWindowIcon()) || '';

  const menu = await Menu.new({
    items: [
      {
        id: 'quit',
        text: '离开',
      },
      {
        id: 'home',
        text: '首页',
      },
      {
        id: 'offline',
        text: '离线',
      },
    ],
  });

  const menuOptions = {
    menu,
    menuOnLeftClick: true,
    icon,
  };

  TrayIcon.new(menuOptions)
    .then((r) => {
      console.log('new', r);
    })
    .catch((err) => {
      console.error('Error setting up tray icon:', err);
    });
};

export { setupTrayIcon };
