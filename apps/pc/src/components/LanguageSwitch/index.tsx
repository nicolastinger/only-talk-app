import { setLocale, getLocale, useIntl } from '@umijs/max';
import { Dropdown } from 'antd';
import React from 'react';
import styles from './index.less';

const LanguageSwitch: React.FC = () => {
  const intl = useIntl();
  const currentLang = getLocale();

  const getLangLabel = () => {
    switch (currentLang) {
      case 'zh-CN':
        return intl.formatMessage({ id: 'language.chinese' });
      case 'zh-TW':
        return intl.formatMessage({ id: 'language.traditional' });
      case 'en-US':
        return intl.formatMessage({ id: 'language.english' });
      default:
        return intl.formatMessage({ id: 'language.chinese' });
    }
  };

  const changeLanguage = (lang: string) => {
    setLocale(lang, false);
    localStorage.setItem('language', lang);
  };

  const items = [
    {
      key: 'zh-CN',
      label: intl.formatMessage({ id: 'language.chinese' }),
      onClick: () => changeLanguage('zh-CN'),
    },
    {
      key: 'zh-TW',
      label: intl.formatMessage({ id: 'language.traditional' }),
      onClick: () => changeLanguage('zh-TW'),
    },
    {
      key: 'en-US',
      label: 'English',
      onClick: () => changeLanguage('en-US'),
    },
  ];

  return (
    <Dropdown menu={{ items, selectedKeys: [currentLang] }} trigger={['click']}>
      <div className={styles.languageSwitch}>
        <span className={styles.langText}>{getLangLabel()}</span>
        <svg
          className={styles.switchIcon}
          viewBox="0 0 24 24"
          fill="currentColor"
          width="16"
          height="16"
        >
          <path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z" />
        </svg>
      </div>
    </Dropdown>
  );
};

export default LanguageSwitch;
