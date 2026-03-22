import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import { useState } from 'react';
import styles from './ThemeButton.less';

const ThemeButton = () => {
  const [isDark, setIsDark] = useState(
    localStorage.getItem('theme') !== 'light',
  );

  const toggleTheme = () => {
    const currentTheme = localStorage.getItem('theme') || 'dark';
    const root = document.documentElement;

    if (currentTheme === 'dark') {
      localStorage.setItem('theme', 'light');
      setIsDark(false);
    } else {
      localStorage.setItem('theme', 'dark');
      setIsDark(true);
    }

    const theme = localStorage.getItem('theme') || 'dark';
    const darkCss = require('@/theme/dark.json');
    const lightCss = require('@/theme/light.json');
    const currentCss = theme === 'dark' ? darkCss : lightCss;

    currentCss.forEach((i: { name: string; value: string }) => {
      root.style.setProperty(i.name, i.value);
    });
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
