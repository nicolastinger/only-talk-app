import { useIntl } from '@umijs/max';
import { useTheme } from '@/hooks/useTheme';

const ChangeTheme = () => {
  const { mode, setMode } = useTheme();
  const intl = useIntl();

  const changeThemeColor = () => {
    setMode(mode === 'dark' ? 'light' : 'dark');
  };

  return (
    <div onClick={changeThemeColor}>
      {intl.formatMessage({ id: 'settings.generalSettings.theme' })}
    </div>
  );
};

export default ChangeTheme;
