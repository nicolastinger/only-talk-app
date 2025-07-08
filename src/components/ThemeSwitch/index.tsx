import darkCss from '@/theme/dark.json';
import lightCss from '@/theme/light.json';

const ChangeTheme = () => {
  const changeThemeColor = () => {
    let currentTheme = localStorage.getItem('theme') || 'dark';
    const root = document.documentElement;
    let currentCss = darkCss;
    if (currentTheme === 'dark') {
      localStorage.setItem('theme', 'light');
      currentCss = lightCss;
    } else {
      localStorage.setItem('theme', 'dark');
    }
    currentCss.forEach((i) => {
      root.style.setProperty(i.name, i.value);
    });
  };

  return <div onClick={changeThemeColor}>更换主题</div>;
};

export default ChangeTheme;
