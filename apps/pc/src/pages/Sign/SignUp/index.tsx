import LanguageSwitcher from '@/components/LanguageSwitch';
import { FormattedMessage } from '@@/exports';
import { CloseOutlined } from '@ant-design/icons';
import { Window } from '@tauri-apps/api/window';
import { history } from '@umijs/max';
import React from 'react';
import FastSignUp from './components/FastSignUp';
import styles from './index.less';

const SignUpPage: React.FC = () => {
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
            <FormattedMessage id="signUp.title" />
          </div>
        </div>

        <div className={styles.formSection}>
          <FastSignUp />
        </div>

        <div className={styles.footerLinks}>
          <span className={styles.link}>
            <FormattedMessage id="signUp.hasAccount" />
          </span>
          <span className={styles.divider}>|</span>
          <a className={styles.link} onClick={goToSignIn}>
            <FormattedMessage id="back" />
          </a>
        </div>
      </div>
    </div>
  );
};

export default SignUpPage;
