import LayoutBtn from '@/components/Button/LayoutBtn';
import { DEFAULT_ICON } from '@/constants';
import { useChatsUnread } from '@/hooks/useChatsUnread';
import { useBearStore } from '@/store/store';
import {
  MessageOutlined,
  SettingOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { history } from '@umijs/max';
import { getFiles } from '@workspace/services';
import { LayoutBtnProps } from '@workspace/types';
import React, { useEffect, useState } from 'react';
import styles from './index.less';
import UserInfoModal from './UserInfoModal';

const LeftAside = () => {
  const [topBtnList, setTopBtnList] = React.useState<LayoutBtnProps[]>([]);
  const [bottomBtnList, setBottomBtnList] = React.useState<LayoutBtnProps[]>(
    [],
  );
  const [isModalVisible, setIsModalVisible] = useState(false);
  const userInfo = useBearStore((state) => state.userInfo);

  const menuUnread = useBearStore((state) => state.menuUnread);
  const { totalUnreadCount } = useChatsUnread(userInfo.uuid);
  const [userIcon, setUserIcon] = useState<string | null>(null);

  const routeToPage = async (url: string) => {
    setTopBtnList((prev) => {
      // 创建新数组保持不可变性
      return prev.map((item) => {
        // 使用展开运算符创建新对象
        if (item.url === url) {
          return { ...item, active: true } as LayoutBtnProps;
        }
        // 建议同时关闭其他激活项
        return { ...item, active: false };
      });
    });

    setBottomBtnList((prev) => {
      // 创建新数组保持不可变性
      return prev.map((item) => {
        // 使用展开运算符创建新对象
        if (item.url === url) {
          return { ...item, active: true } as LayoutBtnProps;
        }
        // 建议同时关闭其他激活项
        return { ...item, active: false };
      });
    });

    history.push(url);
  };

  const showModal = () => {
    setIsModalVisible(true);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
  };

  useEffect(() => {
    setTopBtnList([
      {
        text: '会话列表',
        url: '/home/chats',
        active: true,
        icon: <MessageOutlined style={{ fontSize: '18px' }} />,
        unreadCount: totalUnreadCount,
      },
      {
        text: '朋友列表',
        url: '/home/contacts',
        active: false,
        icon: <UserOutlined style={{ fontSize: '18px' }} />,
        unreadCount: menuUnread.contacts,
      },
    ]);

    setBottomBtnList([
      {
        text: '设置',
        url: '/home/settings',
        active: false,
        icon: <SettingOutlined style={{ fontSize: '18px' }} />,
        unreadCount: menuUnread.settings,
      },
    ]);
  }, [menuUnread, totalUnreadCount]);

  // 监听路由变化，更新按钮激活状态
  useEffect(() => {
    // 获取当前路径
    const updateActiveButton = () => {
      const currentPath = history.location.pathname;

      // 更新顶部按钮列表的激活状态
      setTopBtnList((prev) =>
        prev.map((item) => ({
          ...item,
          active:
            currentPath === item.url || currentPath.startsWith(item.url + '/'),
        })),
      );

      // 更新底部按钮列表的激活状态
      setBottomBtnList((prev) =>
        prev.map((item) => ({
          ...item,
          active:
            currentPath === item.url || currentPath.startsWith(item.url + '/'),
        })),
      );
    };

    // 初始更新一次
    updateActiveButton();

    // 监听路由变化
    const unlisten = history.listen(updateActiveButton);

    // 清理函数
    return () => unlisten();
  }, []);
  const renderBtn = (value: LayoutBtnProps[]) => {
    return (
      <>
        {value.map((item, index) => (
          <div
            onClick={() => routeToPage(item.url)}
            key={index}
            className={styles.iconBtn}
          >
            {LayoutBtn({
              icon: item.icon,
              text: '',
              unreadCount: item.unreadCount,
              url: item.url,
              active: item.active,
            })}
          </div>
        ))}
      </>
    );
  };

  useEffect(() => {
    getUserIcon();
  }, [userInfo]);

  // 获取用户头像
  const getUserIcon = async () => {
    try {
      const FileVos = await getFiles(userInfo.icon || '');
      setUserIcon(FileVos?.[0]?.tauri_file_path || null);
      console.log('用户信息', userInfo);
    } catch (error) {
      console.log(error);
    }
  };

  // 组件卸载时清理 URL 对象
  useEffect(() => {
    return () => {
      if (userIcon) {
        URL.revokeObjectURL(userIcon);
      }
    };
  }, [userIcon]);

  return (
    <div className={styles.leftSideBar}>
      <div className={styles.top}>
        <div className={styles.header}></div>
        <div className={styles.icon} onClick={showModal}>
          <img
            width={100}
            height={100}
            src={userIcon || DEFAULT_ICON}
            className={styles.imgItem}
            alt={'icon'}
          />
        </div>
        {renderBtn(topBtnList)}
      </div>
      <div className={styles.bottom}>{renderBtn(bottomBtnList)}</div>

      <UserInfoModal visible={isModalVisible} onClose={handleCancel} />
    </div>
  );
};

export { LeftAside };
