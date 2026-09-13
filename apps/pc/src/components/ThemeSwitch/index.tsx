import { useIntl } from '@umijs/max';
import { useTheme } from '@/hooks/useTheme';

const ChangeTheme = () => {
  const { mode, setMode } = useTheme();
  const intl = useIntl();

  const changeThemeColor = (e: React.MouseEvent<HTMLDivElement>) => {
    setMode(mode === 'dark' ? 'light' : 'dark', {
      x: e.clientX,
      y: e.clientY,
    });
  };

  return (
    <div onClick={changeThemeColor}>
      {intl.formatMessage({ id: 'settings.generalSettings.theme' })}
    </div>
  );
};

export default ChangeTheme;
