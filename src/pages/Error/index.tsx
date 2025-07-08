import { FormattedMessage, history } from '@umijs/max';
import { Button, Result } from 'antd';
export default function NotFound() {
  // 处理返回首页的逻辑
  const handleBackHome = () => {
    history.push('/home');
  };

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Result
        status="404"
        title="404"
        subTitle={<FormattedMessage id="not-found" />}
        extra={
          <Button type="primary" onClick={handleBackHome}>
            <FormattedMessage id="back" />
          </Button>
        }
      />
    </div>
  );
}
