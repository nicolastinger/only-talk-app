import FriendRequestsModal from '@/components/FriendRequestsModal';
import { openNewWindowWithoutClose } from '@/components/Window/OpenWindow';
import { useBearStore } from '@/store/store';
import {
  BellOutlined,
  SearchOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { WebviewOptions } from '@tauri-apps/api/webview';
import type { WindowOptions } from '@tauri-apps/api/window';
import { Badge } from 'antd';
import { useState } from 'react';
import styles from './index.less';

const SearchBar = () => {
  const menuUnread = useBearStore((state) => state.menuUnread);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [value, setValue] = useState('');

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

  const totalUnread = Object.values(menuUnread).reduce(
    (sum, count) => sum + count,
    0,
  );

  return (
    <div className={styles.container}>
      <div className={styles.searchWrapper}>
        <SearchOutlined className={styles.searchIcon} />
        <input
          className={styles.searchInput}
          placeholder="搜索"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <div className={styles.actionBar}>
        <div className={styles.actionBtn} onClick={handleAdd}>
          <UserAddOutlined className={styles.actionIcon} />
          <span>添加好友</span>
        </div>
        <div className={styles.divider} />
        <div className={styles.actionBtn} onClick={handleNotificationClick}>
          <Badge
            count={totalUnread > 99 ? '99+' : totalUnread}
            overflowCount={99}
            size="small"
          >
            <BellOutlined className={styles.actionIcon} />
          </Badge>
          <span>好友通知</span>
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
