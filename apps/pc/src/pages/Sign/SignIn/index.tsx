import LanguageSwitcher from '@/components/LanguageSwitch';
import LocalImage from '@/components/LocalImage';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import { openNewWindow } from '@/components/Window/OpenWindow';
import { DEFAULT_ICON, TALK_API } from '@/constants';
import { FormattedMessage } from '@@/exports';
import { CloseOutlined, LockOutlined, UserOutlined, EyeOutlined, EyeInvisibleOutlined, LeftOutlined, RightOutlined, DeleteOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { WebviewOptions } from '@tauri-apps/api/webview';
import { Window } from '@tauri-apps/api/window';
import { history, useIntl } from '@umijs/max';
import { getFiles } from '@workspace/services';
import { HttpResponse, ResponseData } from '@workspace/types';
import { Avatar, Button, Checkbox, message, Modal } from 'antd';
import React, { useEffect, useState } from 'react';
import styles from './index.less';

interface QuickLoginUser {
  user_id: string;
  username: string | null;
  account: string | null;
  icon: string | null;
  refresh_token: string | null;
  updated_at: number | null;
}

const LoginPage: React.FC = () => {
  const [messageApi, contextHolder] = message.useMessage();
  const [userCode, setUserCode] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [isPrivacyModalOpen, setPrivacyModalOpen] = useState(false);
  const [privacyContent, setPrivacyContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [userCodeError, setUserCodeError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const intl = useIntl();

  const [quickUsers, setQuickUsers] = useState<QuickLoginUser[]>([]);
  const [currentUserIndex, setCurrentUserIndex] = useState(0);
  const [quickLoginLoading, setQuickLoginLoading] = useState(false);
  const [showQuickLogin, setShowQuickLogin] = useState(true);

  useEffect(() => {
    loadQuickUsers();
  }, []);

  const loadQuickUsers = async () => {
    try {
      const users: QuickLoginUser[] = await invoke('get_quick_login_users');
      setQuickUsers(users);
      if (users.length > 0) {
        setShowQuickLogin(true);
        loadUserAvatar(users[0]);
      }
    } catch (err) {
      console.log('加载免登录用户失败', err);
    }
  };

  const loadUserAvatar = async (user: QuickLoginUser) => {
    if (user.icon) {
      try {
        const fileVos = await getFiles(user.icon);
        if (fileVos && fileVos.length > 0 && fileVos[0].tauri_file_path) {
          setAvatarUrl(fileVos[0].tauri_file_path);
          return;
        }
      } catch {}
    }
    setAvatarUrl('');
  };

  const handlePrevUser = () => {
    if (quickUsers.length <= 1) return;
    const newIndex = (currentUserIndex - 1 + quickUsers.length) % quickUsers.length;
    setCurrentUserIndex(newIndex);
    loadUserAvatar(quickUsers[newIndex]);
  };

  const handleNextUser = () => {
    if (quickUsers.length <= 1) return;
    const newIndex = (currentUserIndex + 1) % quickUsers.length;
    setCurrentUserIndex(newIndex);
    loadUserAvatar(quickUsers[newIndex]);
  };

  const handleDeleteUser = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const user = quickUsers[currentUserIndex];
    if (!user?.user_id) return;

    try {
      await invoke('delete_quick_login_user', { userId: user.user_id });
      const newUsers = quickUsers.filter((_, idx) => idx !== currentUserIndex);
      setQuickUsers(newUsers);
      
      if (newUsers.length === 0) {
        setShowQuickLogin(false);
        setAvatarUrl('');
      } else {
        const newIndex = currentUserIndex >= newUsers.length ? 0 : currentUserIndex;
        setCurrentUserIndex(newIndex);
        loadUserAvatar(newUsers[newIndex]);
      }
      messageApi.success('已删除');
    } catch (err) {
      console.log(err);
      messageApi.error('删除失败');
    }
  };

  const handleQuickLogin = async () => {
    const user = quickUsers[currentUserIndex];
    if (!user?.refresh_token) return;

    setQuickLoginLoading(true);
    try {
      const response: HttpResponse = await invoke('quick_login', {
        refreshToken: user.refresh_token,
        url: TALK_API,
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
        await openNewWindow('home', webviewOptions, Window.getCurrent(), 'Only Talk');
      } else {
        messageApi.error('免登录失败，请手动登录');
        setShowQuickLogin(false);
      }
    } catch (error) {
      console.log(error);
      messageApi.error('免登录失败，请手动登录');
      setShowQuickLogin(false);
    } finally {
      setQuickLoginLoading(false);
    }
  };

  const closeWindow = async () => {
    const currentWindow = Window.getCurrent();
    await currentWindow.close();
  };

  const goToSignUp = async () => {
    history.push('/signUp');
  };

  const validateUserCode = (value: string): boolean => {
    if (!value) {
      setUserCodeError(intl.formatMessage({ id: 'signIn.errors.usernameRequired' }));
      return false;
    }
    if (value.length < 5) {
      setUserCodeError(intl.formatMessage({ id: 'signIn.errors.usernameTooShort' }));
      return false;
    }
    setUserCodeError('');
    return true;
  };

  const validatePassword = (value: string): boolean => {
    if (!value) {
      setPasswordError(intl.formatMessage({ id: 'signIn.errors.passwordRequired' }));
      return false;
    }
    if (value.length < 8) {
      setPasswordError(intl.formatMessage({ id: 'signIn.errors.passwordTooShort' }));
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
    loadAvatarByAccount(value);
  };

  const loadAvatarByAccount = (account: string) => {
    if (!account) {
      setAvatarUrl('');
      return;
    }
    const matchedUser = quickUsers.find(
      (user) => user.account === account || user.username === account
    );
    if (matchedUser) {
      loadUserAvatar(matchedUser);
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
        body: { account, password, platform: 'PC' },
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
        await openNewWindow('home', webviewOptions, Window.getCurrent(), 'Only Talk');
      } else {
        messageApi.error(<FormattedMessage id="signIn.errors.invalidCredentials" />);
      }
    } catch (error: unknown) {
      if (error != null && typeof error === 'string') {
        try {
          const result = JSON.parse(error);
          if (result.code === 500) {
            messageApi.error(<FormattedMessage id="signIn.errors.invalidCredentials" />);
          }
        } catch (e) {
          messageApi.error(<FormattedMessage id="signIn.errors.networkError" />);
        }
      } else {
        messageApi.error(<FormattedMessage id="signIn.errors.networkError" />);
      }
    } finally {
      setLoading(false);
    }
  };

  const onFinish = () => {
    const isUserCodeValid = validateUserCode(userCode);
    const isPasswordValid = validatePassword(password);
    if (!isUserCodeValid || !isPasswordValid) return;
    if (!agreed) {
      messageApi.warning(intl.formatMessage({ id: 'signIn.errors.pleaseAgree' }));
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

  const currentUser = quickUsers[currentUserIndex];
  const hasQuickUsers = quickUsers.length > 0;

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
        {showQuickLogin && hasQuickUsers ? (
          <div className={styles.quickLoginSection}>
            <div className={styles.quickLoginAvatar}>
              {quickUsers.length > 1 && (
                <div className={styles.switchBtn} onClick={handlePrevUser}>
                  <LeftOutlined />
                </div>
              )}
              <div className={styles.avatarContainer}>
                <div className={styles.avatarWrapper}>
                  {avatarUrl ? (
                    <Avatar src={avatarUrl} size={80} />
                  ) : (
                    <LocalImage width={80} height={80} />
                  )}
                </div>
                <div className={styles.deleteBtn} onClick={handleDeleteUser}>
                  <DeleteOutlined />
                </div>
              </div>
              {quickUsers.length > 1 && (
                <div className={styles.switchBtn} onClick={handleNextUser}>
                  <RightOutlined />
                </div>
              )}
            </div>
            <div className={styles.quickLoginName}>
              {currentUser?.username || currentUser?.account || '用户'}
            </div>
            {quickUsers.length > 1 && (
              <div className={styles.userIndicator}>
                {quickUsers.map((_, idx) => (
                  <span
                    key={idx}
                    className={`${styles.dot} ${idx === currentUserIndex ? styles.dotActive : ''}`}
                    onClick={() => { setCurrentUserIndex(idx); loadUserAvatar(quickUsers[idx]); }}
                  />
                ))}
              </div>
            )}
            <button
              className={styles.loginBtn}
              onClick={handleQuickLogin}
              disabled={quickLoginLoading}
            >
              {quickLoginLoading ? (
                <span className={styles.loadingDot}>...</span>
              ) : (
                '一键登录'
              )}
            </button>
            <a className={styles.switchToPassword} onClick={() => { setAvatarUrl(''); setShowQuickLogin(false); }}>
              使用密码登录
            </a>
          </div>
        ) : (
          <div className={styles.passwordLoginSection}>
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
                <div className={`${styles.inputGroup} ${userCodeError ? styles.inputError : ''}`}>
                  <UserOutlined className={styles.inputIcon} />
                  <input
                    type="text"
                    className={styles.input}
                    placeholder={intl.formatMessage({ id: 'signIn.username' })}
                    value={userCode}
                    onChange={handleUserCodeChange}
                  />
                </div>
                {userCodeError && <span className={styles.errorText}>{userCodeError}</span>}
              </div>

              <div className={styles.inputWrapper}>
                <div className={`${styles.inputGroup} ${passwordError ? styles.inputError : ''}`}>
                  <LockOutlined className={styles.inputIcon} />
                  <input
                    type={passwordVisible ? 'text' : 'password'}
                    className={styles.input}
                    placeholder={intl.formatMessage({ id: 'signIn.password' })}
                    value={password}
                    onChange={handlePasswordChange}
                    onBlur={() => validatePassword(password)}
                  />
                  <span className={styles.eyeIcon} onClick={() => setPasswordVisible(!passwordVisible)}>
                    {passwordVisible ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                  </span>
                </div>
                {passwordError && <span className={styles.errorText}>{passwordError}</span>}
              </div>

              <div className={styles.options}>
                <Checkbox checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className={styles.checkbox}>
                  <FormattedMessage id="signIn.agreement" />
                  <a onClick={(e) => openPrivacyModal(e)} className={styles.link}>
                    <FormattedMessage id="signIn.privacyPolicy" />
                  </a>
                </Checkbox>
              </div>

              <button className={styles.loginBtn} onClick={onFinish} disabled={loading}>
                {loading ? <span className={styles.loadingDot}>...</span> : intl.formatMessage({ id: 'signIn.submit' })}
              </button>

              <div className={styles.footerLinks}>
                {hasQuickUsers && (
                  <>
                    <a className={styles.link} onClick={() => { setShowQuickLogin(true); loadUserAvatar(quickUsers[currentUserIndex]); }}>
                      免登录
                    </a>
                    <span className={styles.divider}>|</span>
                  </>
                )}
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
        )}
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