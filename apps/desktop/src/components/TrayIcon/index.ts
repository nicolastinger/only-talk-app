import { defaultWindowIcon } from '@tauri-apps/api/app';
import { Menu } from '@tauri-apps/api/menu';
import { TrayIcon } from '@tauri-apps/api/tray';
import { t } from '@/i18n';

const setupTrayIcon = async () => {
  const icon = (await defaultWindowIcon()) || '';

  const menu = await Menu.new({
    items: [
      {
        id: 'quit',
        text: t('onlineStatus.away'),
      },
      {
        id: 'home',
        text: t('menu.home'),
      },
      {
        id: 'offline',
        text: t('homeLayout.connOffline'),
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
