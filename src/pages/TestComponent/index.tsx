import { PageContainer } from '@ant-design/pro-components';
import FileSelectorTest from './components/FileSelectorTest';

const TestComponentPage: React.FC = () => {
  return (
    <PageContainer
      ghost
      header={{
        title: '组件测试',
      }}
    >
      <FileSelectorTest />
    </PageContainer>
  );
};

export default TestComponentPage;
