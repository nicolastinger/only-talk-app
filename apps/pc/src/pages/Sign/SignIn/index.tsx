import LanguageSwitcher from '@/components/LanguageSwitch';
import LocalImage from '@/components/LocalImage';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import { openNewWindow } from '@/components/Window/OpenWindow';
import { TALK_API } from '@/constants';
import { FormattedMessage } from '@@/exports';
import { CloseOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { WebviewOptions } from '@tauri-apps/api/webview';
import { Window } from '@tauri-apps/api/window';
import { history, useIntl } from '@umijs/max';
import { get_cached_user_info_by_account, getFiles } from '@workspace/services';
import { HttpResponse, ResponseData } from '@workspace/types';
import { Avatar, Button, Checkbox, message, Modal } from 'antd';
import React, { useState } from 'react';
import styles from './index.less';

const LoginPage: React.FC = () => {
  const [messageApi, contextHolder] = message.useMessage();
  const [userCode, setUserCode] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [isPrivacyModalOpen, setPrivacyModalOpen] = useState(false);
  const [privacyContent, setPrivacyContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [userCodeError, setUserCodeError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const intl = useIntl();

  const closeWindow = async () => {
    const currentWindow = Window.getCurrent();
    await currentWindow.close();
  };

  const goToSignUp = async () => {
    history.push('/signUp');
  };

  const validateUserCode = (value: string): boolean => {
    if (!value) {
      setUserCodeError(
        intl.formatMessage({ id: 'signIn.errors.usernameRequired' }),
      );
      return false;
    }
    if (value.length < 5) {
      setUserCodeError(
        intl.formatMessage({ id: 'signIn.errors.usernameTooShort' }),
      );
      return false;
    }
    setUserCodeError('');
    return true;
  };

  const validatePassword = (value: string): boolean => {
    if (!value) {
      setPasswordError(
        intl.formatMessage({ id: 'signIn.errors.passwordRequired' }),
      );
      return false;
    }
    if (value.length < 8) {
      setPasswordError(
        intl.formatMessage({ id: 'signIn.errors.passwordTooShort' }),
      );
      return false;
    }
    setPasswordError('');
    return true;
  };

  const handleUserCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setUserCode(value);
    if (userCodeError) {
      validateUserCode(value);
    }
  };

  const handleUserCodeBlur = async () => {
    validateUserCode(userCode);
    if (userCode && userCode.length >= 5) {
      try {
        const cachedUser = await get_cached_user_info_by_account(userCode);
        if (cachedUser && cachedUser.icon) {
          const fileVos = await getFiles(cachedUser.icon);
          if (fileVos && fileVos.length > 0 && fileVos[0].tauri_file_path) {
            setAvatarUrl(fileVos[0].tauri_file_path);
          } else {
            setAvatarUrl('');
          }
        } else {
          setAvatarUrl('');
        }
      } catch (error) {
        console.error('获取缓存用户信息失败:', error);
        setAvatarUrl('');
      }
    } else {
      setAvatarUrl('');
    }
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPassword(value);
    if (passwordError) {
      validatePassword(value);
    }
  };

  const fetchData = async (account: string, password: string) => {
    setLoading(true);
    try {
      const response: HttpResponse = await invoke('sign_in', {
        url: TALK_API + '/user/sign_in',
        body: {
          account,
          password,
          platform: 'PC',
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
        await openNewWindow(
          'home',
          webviewOptions,
          Window.getCurrent(),
          'Only Talk',
        );
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
        } catch (e) {
          messageApi.error(
            <FormattedMessage id="signIn.errors.networkError" />,
          );
        }
      } else {
        messageApi.error(<FormattedMessage id="signIn.errors.networkError" />);
      }

      console.log(error);
    } finally {
      setLoading(false);
    }
  };

  const onFinish = () => {
    const isUserCodeValid = validateUserCode(userCode);
    const isPasswordValid = validatePassword(password);

    if (!isUserCodeValid || !isPasswordValid) {
      return;
    }

    if (!agreed) {
      messageApi.warning(
        intl.formatMessage({ id: 'signIn.errors.pleaseAgree' }),
      );
      return;
    }

    fetchData(userCode, password);
  };

  const loadPrivacyMd = async () => {
    const res = await fetch('/markdown/privacy.md');
    const text = await res.text();
    setPrivacyContent(text);
  };

  const openPrivacyModal = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    await loadPrivacyMd();
    setPrivacyModalOpen(true);
  };

  const closePrivacyModal = () => {
    setPrivacyModalOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onFinish();
    }
  };

  return (
    <div className={styles.container}>
      {contextHolder}
      <div className={styles.titleBar}>
        <div className={styles.logo}>
          <span className={styles.appName}>Only Talk</span>
        </div>
        <div className={styles.windowControls}>
          <LanguageSwitcher />
          <div onClick={closeWindow} className={styles.closeBtn}>
            <CloseOutlined />
          </div>
        </div>
      </div>

      <div className={styles.content} onKeyDown={handleKeyDown}>
        <div className={styles.avatarSection}>
          <div className={styles.avatarWrapper}>
            {avatarUrl ? (
              <Avatar src={avatarUrl} size={80} />
            ) : (
              <LocalImage width={80} height={80} />
            )}
          </div>
          <div className={styles.welcomeText}>
            <FormattedMessage id="signIn.welcome" />
          </div>
        </div>

        <div className={styles.formSection}>
          <div className={styles.inputWrapper}>
            <div
              className={`${styles.inputGroup} ${
                userCodeError ? styles.inputError : ''
              }`}
            >
              <UserOutlined className={styles.inputIcon} />
              <input
                type="text"
                className={styles.input}
                placeholder={intl.formatMessage({ id: 'signIn.username' })}
                value={userCode}
                onChange={handleUserCodeChange}
                onBlur={handleUserCodeBlur}
              />
            </div>
            {userCodeError && (
              <span className={styles.errorText}>{userCodeError}</span>
            )}
          </div>

          <div className={styles.inputWrapper}>
            <div
              className={`${styles.inputGroup} ${
                passwordError ? styles.inputError : ''
              }`}
            >
              <LockOutlined className={styles.inputIcon} />
              <input
                type="password"
                className={styles.input}
                placeholder={intl.formatMessage({ id: 'signIn.password' })}
                value={password}
                onChange={handlePasswordChange}
                onBlur={() => validatePassword(password)}
              />
            </div>
            {passwordError && (
              <span className={styles.errorText}>{passwordError}</span>
            )}
          </div>

          <div className={styles.options}>
            <Checkbox
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className={styles.checkbox}
            >
              <FormattedMessage id="signIn.agreement" />
              <a onClick={(e) => openPrivacyModal(e)} className={styles.link}>
                <FormattedMessage id="signIn.privacyPolicy" />
              </a>
            </Checkbox>
          </div>

          <button
            className={styles.loginBtn}
            onClick={onFinish}
            disabled={loading}
          >
            {loading ? (
              <span className={styles.loadingDot}>...</span>
            ) : (
              intl.formatMessage({ id: 'signIn.submit' })
            )}
          </button>

          <div className={styles.footerLinks}>
            <a className={styles.link}>
              <FormattedMessage id="signIn.forgotPassword" />
            </a>
            <span className={styles.divider}>|</span>
            <a className={styles.link} onClick={goToSignUp}>
              <FormattedMessage id="signUp.title" />
            </a>
          </div>
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
            <FormattedMessage id="signIn.close" />
          </Button>,
          <Button key="ok" type="primary" onClick={closePrivacyModal}>
            <FormattedMessage id="signIn.confirm" />
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
