import { getLocale, setLocale, useIntl } from '@umijs/max';
import { Dropdown } from 'antd';
import styles from './LanguageButton.less';

const LanguageButton = () => {
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
      <div className={styles.languageButton}>{getLangLabel()}</div>
    </Dropdown>
  );
};

export default LanguageButton;
