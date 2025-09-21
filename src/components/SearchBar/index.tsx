import { openNewWindowWithoutClose } from '@/components/Window/OpenWindow';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { WebviewOptions } from '@tauri-apps/api/webview';
import type { WindowOptions } from '@tauri-apps/api/window';
import { Button, Input } from 'antd';
import styles from './index.less';

const SearchBar = () => {
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

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.searchInput}>
          <Input placeholder="搜索" />
        </div>
        <div className={styles.searchButton}>
          <Button icon={<SearchOutlined />} />
        </div>
        <div className={styles.addButton}>
          <Button icon={<PlusOutlined />} onClick={handleAdd} />
        </div>
      </div>
    </div>
  );
};

export default SearchBar;
