import { CloseOutlined } from '@ant-design/icons';
import { Window } from '@tauri-apps/api/window';
import styles from './CloseButton.less';

const CloseButton = () => {
  // 关闭窗口
  const closeWindow = async () => {
    const currentWindow = Window.getCurrent();
    await currentWindow.close();
  };

  return (
    <div className={styles.container}>
      <div onClick={closeWindow} className={styles.content}>
        <CloseOutlined />
      </div>
    </div>
  );
};

export default CloseButton;
