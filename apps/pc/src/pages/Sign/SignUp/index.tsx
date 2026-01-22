import CloseButton from '@/components/TopBar/Buttons/CloseButton';
import LanguageSwitcher from '@/components/LanguageSwitch';
import { useIntl } from '@umijs/max';
import { Avatar, Button } from 'antd';
import React from 'react';
import FastSignUp from './components/FastSignUp';
import styles from './index.less';
import { history } from '@umijs/max';
import { useWindowDrag } from '@/hooks';

const AVATAR_URL =
  'https://ss2.bdstatic.com/70cFvXSh_Q1YnxGkpoWK1HF6hhy/it/u=16890549,1598107895&fm=253&gp=0.jpg';

const SignUpPage: React.FC = () => {
  const intl = useIntl();
  const dragRef = useWindowDrag();

  // 跳转到登录页面
  const goToSignIn = async () => {
    history.push('/signIn');
  };

  return (
    <div className={styles.container}>
      <div className={styles.closeBtn}>
        <CloseButton />
      </div>
      <div className={styles.content} ref={dragRef}>
        <div className={styles.langSwitcher}>
          <LanguageSwitcher />
        </div>

        <div className={styles.title}>
          {intl.formatMessage({ id: 'signUp.title' })}
        </div>

        <div className={styles.formContainer}>
          <FastSignUp />
        </div>

        <div className={styles.bottomOptions}>
          <Button type="link" onClick={goToSignIn}>
            {intl.formatMessage({ id: 'back' })}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SignUpPage;