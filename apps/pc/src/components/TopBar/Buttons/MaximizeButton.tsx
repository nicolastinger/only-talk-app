import { CompressOutlined, ExpandOutlined } from '@ant-design/icons';
import { Window } from '@tauri-apps/api/window';
import { useEffect, useState } from 'react';
import styles from './MaximizeButton.less';

const MaximizeButton = () => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const checkMaximized = async () => {
      const currentWindow = Window.getCurrent();
      const maximized = await currentWindow.isMaximized();
      setIsMaximized(maximized);
    };

    checkMaximized();
  }, []);

  const toggleMaximize = async () => {
    const currentWindow = Window.getCurrent();
    const maximized = await currentWindow.isMaximized();

    if (maximized) {
      await currentWindow.unmaximize();
      setIsMaximized(false);
    } else {
      await currentWindow.maximize();
      setIsMaximized(true);
    }
  };

  return (
    <div className={styles.container}>
      <div onClick={toggleMaximize} className={styles.content}>
        {isMaximized ? <CompressOutlined /> : <ExpandOutlined />}
      </div>
    </div>
  );
};

export default MaximizeButton;
