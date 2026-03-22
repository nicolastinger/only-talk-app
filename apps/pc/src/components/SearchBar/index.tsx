import FriendRequestsModal from '@/components/FriendRequestsModal';
import { openNewWindowWithoutClose } from '@/components/Window/OpenWindow';
import { useBearStore } from '@/store/store';
import { BellOutlined, UserAddOutlined } from '@ant-design/icons';
import { WebviewOptions } from '@tauri-apps/api/webview';
import type { WindowOptions } from '@tauri-apps/api/window';
import { Badge, Button, Input } from 'antd';
import { useState } from 'react';
import styles from './index.less';

const SearchBar = () => {
  const menuUnread = useBearStore((state) => state.menuUnread);
  const [isModalVisible, setIsModalVisible] = useState(false);

  const handleNotificationClick = () => {
    setIsModalVisible(true);
  };

  const handleModalClose = () => {
    setIsModalVisible(false);
  };

  const handleAdd = async () => {
    const webviewOptions: WebviewOptions = {
      x: 0,
      y: 0,
      url: `/search/friend`,
      height: 500,
      width: 300,
    };
    const config: WindowOptions = {
      center: true,
    };
    await openNewWindowWithoutClose('新增好友', webviewOptions, config);
  };

  // 计算总的通知数量
  const totalUnread = Object.values(menuUnread).reduce(
    (sum, count) => sum + count,
    0,
  );

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.searchInput}>
          <Input placeholder="搜索" />
        </div>
        <div className={styles.addButton}>
          <Button icon={<UserAddOutlined />} onClick={handleAdd} />
        </div>
        <div className={styles.searchButton}>
          <Badge
            count={totalUnread > 10 ? '9+' : totalUnread}
            overflowCount={10}
          >
            <Button icon={<BellOutlined />} onClick={handleNotificationClick} />
          </Badge>
        </div>
      </div>
      <FriendRequestsModal
        visible={isModalVisible}
        onClose={handleModalClose}
      />
    </div>
  );
};

export default SearchBar;
