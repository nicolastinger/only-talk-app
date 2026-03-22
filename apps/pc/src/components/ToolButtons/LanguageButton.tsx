import { setLocale } from '@umijs/max';
import { Tooltip } from 'antd';
import { useState } from 'react';
import styles from './LanguageButton.less';

const LanguageButton = () => {
  const [isEnglish, setIsEnglish] = useState(
    localStorage.getItem('language') === 'en-US',
  );

  const toggleLanguage = () => {
    const currentLanguage = localStorage.getItem('language') || 'zh-CN';
    if (currentLanguage === 'zh-CN') {
      setLocale('en-US', false);
      localStorage.setItem('language', 'en-US');
      setIsEnglish(true);
    } else {
      setLocale('zh-CN', false);
      localStorage.setItem('language', 'zh-CN');
      setIsEnglish(false);
    }
  };

  return (
    <Tooltip title={isEnglish ? '切换中文' : '切换英文'} placement="bottom">
      <div className={styles.languageButton} onClick={toggleLanguage}>
        {isEnglish ? 'EN' : '中文'}
      </div>
    </Tooltip>
  );
};

export default LanguageButton;
