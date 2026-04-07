import LanguageSwitcher from '@/components/LanguageSwitch';
import LocalImage from '@/components/LocalImage';
import { FormattedMessage } from '@@/exports';
import { CloseOutlined } from '@ant-design/icons';
import { Window } from '@tauri-apps/api/window';
import { history, useIntl } from '@umijs/max';
import React from 'react';
import FastSignUp from './components/FastSignUp';
import styles from './index.less';

const SignUpPage: React.FC = () => {
  const intl = useIntl();

  const closeWindow = async () => {
    const currentWindow = Window.getCurrent();
    await currentWindow.close();
  };

  const goToSignIn = async () => {
    history.push('/signIn');
  };

  return (
    <div className={styles.container}>
      <div className={styles.titleBar}>
        <div className={styles.logo}>
          <LocalImage width={20} height={20} />
          <span className={styles.appName}>Only Talk</span>
        </div>
        <div className={styles.windowControls}>
          <LanguageSwitcher />
          <div onClick={closeWindow} className={styles.closeBtn}>
            <CloseOutlined />
          </div>
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.avatarSection}>
          <div className={styles.welcomeText}>
            <FormattedMessage id="signUp.title" defaultMessage="创建账户" />
          </div>
        </div>

        <div className={styles.formSection}>
          <FastSignUp />
        </div>

        <div className={styles.footerLinks}>
          <span className={styles.link}>
            <FormattedMessage
              id="signUp.hasAccount"
              defaultMessage="已有账户？"
            />
          </span>
          <span className={styles.divider}>|</span>
          <a className={styles.link} onClick={goToSignIn}>
            <FormattedMessage id="back" defaultMessage="返回登录" />
          </a>
        </div>
      </div>
    </div>
  );
};

export default SignUpPage;
