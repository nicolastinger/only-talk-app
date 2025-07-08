import LanguageSwitcher from '@/components/LanguageSwitch';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import { openNewWindow } from '@/components/Window/OpenWindow';
import { TALK_API } from '@/constants';
import { HttpResponse, ResponseData } from '@/types/backend/httpRust';
import { FormattedMessage } from '@@/exports';
import {
  CloseOutlined,
  EyeInvisibleOutlined,
  EyeTwoTone,
  LockOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { WebviewOptions } from '@tauri-apps/api/webview';
import { Window } from '@tauri-apps/api/window';
import { useIntl } from '@umijs/max';
import { Avatar, Button, Checkbox, Input, message, Modal } from 'antd';
import React, { useState } from 'react';
import styles from './index.less';

const AVATAR_URL =
  'https://ss2.bdstatic.com/70cFvXSh_Q1YnxGkpoWK1HF6hhy/it/u=16890549,1598107895&fm=253&gp=0.jpg';

const LoginPage: React.FC = () => {
  const [messageApi, contextHolder] = message.useMessage();
  const [userCode, setUserCode] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [isPrivacyModalOpen, setPrivacyModalOpen] = useState(false);
  const [privacyContent, setPrivacyContent] = useState('');
  const intl = useIntl();

  // 关闭窗口
  const closeWindow = async () => {
    const currentWindow = Window.getCurrent();
    await currentWindow.close();
  };

  const fetchData = async (account: string, password: string) => {
    try {
      const response: HttpResponse = await invoke('sign_in', {
        url: TALK_API + '/user/sign_in',
        body: {
          account,
          password,
        },
      });

      const data: ResponseData = JSON.parse(response.body);

      if (data.code === 200) {
        messageApi.open({
          type: 'success',
          content: <FormattedMessage id="signIn.success" />,
        });
        const webviewOptions: WebviewOptions = {
          url: '/home/chats',
          height: 600,
          width: 800,
          x: 200,
          y: 200,
        };
        await openNewWindow('主页', webviewOptions, Window.getCurrent());
      } else {
        messageApi.error(
          <FormattedMessage id="signIn.errors.invalidCredentials" />,
        );
      }
    } catch (error: unknown) {
      if (error != null && typeof error === 'string') {
        try {
          const result = JSON.parse(error);
          if (result.code === 500) {
            messageApi.error(
              <FormattedMessage id="signIn.errors.invalidCredentials" />,
            );
          }
        }
        catch (e) {
          messageApi.error(<FormattedMessage id="signIn.errors.networkError" />);
        }
      } else {
        messageApi.error(<FormattedMessage id="signIn.errors.networkError" />);
      }

      console.log(error);
    }
  };

  const onFinish = () => {
    console.log('userCode:', userCode, 'password:', password);
    fetchData(userCode, password);
  };

  // 读取md内容
  const loadPrivacyMd = async () => {
    // 这里用fetch读取public下的md文件
    const res = await fetch('/markdown/privacy.md');
    const text = await res.text();
    setPrivacyContent(text);
  };

  const openPrivacyModal = async () => {
    await loadPrivacyMd();
    setPrivacyModalOpen(true);
  };

  const closePrivacyModal = () => {
    setPrivacyModalOpen(false);
  };

  return (
    <div className={styles.container}>
      {contextHolder}
      <div className={styles.closeBtn}>
        <div onClick={closeWindow} className={styles.rightButtonDanger}>
          <CloseOutlined />
        </div>
      </div>
      <div className={styles.content}>
        <div className={styles.langSwitcher}>
          <LanguageSwitcher />
        </div>

        <div className={styles.avatarContainer}>
          <Avatar size={80} icon={<UserOutlined />} src={AVATAR_URL} />
        </div>

        <div className={styles.inputContainer}>
          <Input
            size="large"
            prefix={<UserOutlined className={styles.icon} />}
            placeholder={intl.formatMessage({ id: 'signIn.username' })}
            value={userCode}
            onChange={(e) => setUserCode(e.target.value)}
          />
          <Input.Password
            prefix={<LockOutlined className={styles.icon} />}
            type="password"
            iconRender={(visible) =>
              visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />
            }
            size="large"
            value={password}
            placeholder={intl.formatMessage({ id: 'signIn.password' })}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className={styles.agreement}>
            <Checkbox
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              style={{ marginRight: 8 }}
            />
            <span>
              已阅读并同意
              <a
                href="#"
                className={styles.highlight}
                onClick={openPrivacyModal}
              >
                服务协议
              </a>
              和
              <a
                href="#"
                className={styles.highlight}
                onClick={openPrivacyModal}
              >
                隐私保护指引
              </a>
            </span>
          </div>
          <div className={styles.buttonContainer}>
            <Button
              type="primary"
              onClick={onFinish}
              className={styles.button}
              block
              size="large"
            >
              {intl.formatMessage({ id: 'signIn.submit' })}
            </Button>
          </div>
        </div>

        <div className={styles.bottomOptions}>
          <span className={styles.highlight}>忘记密码</span>
          <span className={styles.highlight}>注册账号</span>
        </div>
      </div>
      <Modal
        open={isPrivacyModalOpen}
        onOk={closePrivacyModal}
        onCancel={closePrivacyModal}
        closable={false}
        title=""
        className={styles.scrollbarHidden}
        footer={[
          <Button key="close" onClick={closePrivacyModal}>
            关闭
          </Button>,
          <Button key="ok" type="primary" onClick={closePrivacyModal}>
            确认
          </Button>,
        ]}
        width={'100%'}
        height={'60vh'}
      >
        <MarkdownRenderer content={privacyContent} />
      </Modal>
    </div>
  );
};

export default LoginPage;
