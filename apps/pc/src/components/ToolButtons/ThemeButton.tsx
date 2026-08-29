import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import { useTheme } from '@/hooks/useTheme';
import styles from './ThemeButton.less';

const ThemeButton = () => {
  const { mode, setMode } = useTheme();
  const isDark = mode === 'dark';

  const toggleTheme = () => {
    setMode(mode === 'dark' ? 'light' : 'dark');
  };

  return (
    <Tooltip
      title={isDark ? '切换亮色主题' : '切换暗色主题'}
      placement="bottom"
    >
      <div className={styles.themeButton} onClick={toggleTheme}>
        {isDark ? <MoonOutlined /> : <SunOutlined />}
      </div>
    </Tooltip>
  );
};

export default ThemeButton;
