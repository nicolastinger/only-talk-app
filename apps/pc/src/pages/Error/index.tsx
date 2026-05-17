import { invoke } from '@tauri-apps/api/core';
import { FormattedMessage, history } from '@umijs/max';
import { Button, Result } from 'antd';

export default function NotFound() {
  // 处理返回首页的逻辑
  const handleBackHome = async () => {
    // 查看用户是否登录
    try {
      let uuid = (await invoke('get_user_map', { key: 'uuid' })) as string;
      if (uuid != null && uuid !== '') {
        history.push('/home');
      } else {
        history.push('/signIn');
      }
    } catch (e) {
      history.push('/signIn');
    }
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
