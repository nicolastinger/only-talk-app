import { setLocale } from '@umijs/max';
import { Select } from 'antd';

const LanguageSwitch = () => {
  const lang = localStorage.getItem('language') || 'zh-CN';
  const changeLanguage = () => {
    const currentLanguage = localStorage.getItem('language') || 'zh-CN';
    if (currentLanguage === 'zh-CN') {
      setLocale('en-US', false);
      localStorage.setItem('language', 'en-US');
    } else {
      setLocale('zh-CN', false);
      localStorage.setItem('language', 'zh-CN');
    }
  };

  return (
    <Select
      value={lang}
      onChange={changeLanguage}
      options={[
        { label: '简体中文', value: 'zh-CN' },
        { label: 'English', value: 'en-US' },
      ]}
      style={{ width: 120 }}
    />
  );
};
export default LanguageSwitch;
