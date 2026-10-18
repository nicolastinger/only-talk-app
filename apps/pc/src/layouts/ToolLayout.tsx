import LanguageSwitch from '@/components/LanguageSwitch';
import ThemeSwitch from '@/components/ThemeSwitch';
import { Outlet } from '@umijs/max';
import { Space } from 'antd';

const ToolLayout: React.FC = () => {
  return (
    <div>
      <div style={{ padding: '16px', textAlign: 'right' }}>
        <Space>
          <ThemeSwitch />
          <LanguageSwitch />
        </Space>
      </div>
      <Outlet />
    </div>
  );
};

export default ToolLayout;
