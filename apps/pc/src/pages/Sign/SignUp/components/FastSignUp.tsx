import {
  EyeInvisibleOutlined,
  EyeOutlined,
  LockOutlined,
  SmileOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import { sign_up } from '@workspace/services';
import { BasicUser } from '@workspace/types';
import { message } from 'antd';
import React, { useState } from 'react';
import styles from '../index.less';

const FastSignUp: React.FC = () => {
  const intl = useIntl();
  const [loading, setLoading] = useState(false);
  const [account, setAccount] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [nicknameError, setNicknameError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const validateAccount = (value: string): boolean => {
    if (!value) {
      setAccountError(
        intl.formatMessage({
          id: 'signUp.accountRequired',
          defaultMessage: '请输入账号',
        }),
      );
      return false;
    }
    if (!/^[a-zA-Z0-9]+$/.test(value)) {
      setAccountError(
        intl.formatMessage({
          id: 'signUp.accountPattern',
          defaultMessage: '账号只能包含字母和数字',
        }),
      );
      return false;
    }
    if (value.length < 8) {
      setAccountError(
        intl.formatMessage({
          id: 'signUp.accountMinLength',
          defaultMessage: '账号至少需要8个字符',
        }),
      );
      return false;
    }
    setAccountError('');
    return true;
  };

  const validateNickname = (value: string): boolean => {
    if (!value) {
      setNicknameError(
        intl.formatMessage({
          id: 'signUp.nicknameRequired',
          defaultMessage: '请输入昵称',
        }),
      );
      return false;
    }
    if (value.length > 8) {
      setNicknameError(
        intl.formatMessage({
          id: 'signUp.nicknameMaxLength',
          defaultMessage: '昵称最多8个字符',
        }),
      );
      return false;
    }
    if (!/^[a-zA-Z0-9\u4e00-\u9fa5#_@!]*$/.test(value)) {
      setNicknameError(
        intl.formatMessage({
          id: 'signUp.nicknamePattern',
          defaultMessage: '昵称包含非法字符',
        }),
      );
      return false;
    }
    setNicknameError('');
    return true;
  };

  const validatePassword = (value: string): boolean => {
    if (!value) {
      setPasswordError(
        intl.formatMessage({
          id: 'signUp.passwordRequired',
          defaultMessage: '请输入密码',
        }),
      );
      return false;
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]+$/.test(value)) {
      setPasswordError(
        intl.formatMessage({
          id: 'signUp.passwordPattern',
          defaultMessage: '密码必须包含大小写字母和数字',
        }),
      );
      return false;
    }
    if (value.length < 13) {
      setPasswordError(
        intl.formatMessage({
          id: 'signUp.passwordMinLength',
          defaultMessage: '密码至少需要13个字符',
        }),
      );
      return false;
    }
    setPasswordError('');
    return true;
  };

  const handleAccountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setAccount(value);
    if (accountError) {
      validateAccount(value);
    }
  };

  const handleNicknameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNickname(value);
    if (nicknameError) {
      validateNickname(value);
    }
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPassword(value);
    if (passwordError) {
      validatePassword(value);
    }
  };

  const onFinish = async () => {
    const isAccountValid = validateAccount(account);
    const isNicknameValid = validateNickname(nickname);
    const isPasswordValid = validatePassword(password);

    if (!isAccountValid || !isNicknameValid || !isPasswordValid) {
      return;
    }

    setLoading(true);

    try {
      const userInfo: BasicUser = {
        account: account,
        username: nickname,
        password: password,
      };
      const res = await sign_up(userInfo);
      if (res.netSuccess && res.res.status === 200) {
        message.success(
          intl.formatMessage({
            id: 'signUp.success',
            defaultMessage: '注册成功',
          }),
        );
      } else {
        message.error(
          intl.formatMessage({
            id: 'signUp.failed',
            defaultMessage: '注册失败',
          }),
        );
      }
    } catch (error) {
      message.error(
        intl.formatMessage({ id: 'signUp.failed', defaultMessage: '注册失败' }),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onFinish();
    }
  };

  return (
    <div className={styles.formInner} onKeyDown={handleKeyDown}>
      <div className={styles.inputWrapper}>
        <div
          className={`${styles.inputGroup} ${
            accountError ? styles.inputError : ''
          }`}
        >
          <UserOutlined className={styles.inputIcon} />
          <input
            type="text"
            className={styles.input}
            placeholder={intl.formatMessage({
              id: 'signUp.accountPlaceholder',
              defaultMessage: '请输入账号',
            })}
            value={account}
            onChange={handleAccountChange}
            onBlur={() => validateAccount(account)}
          />
        </div>
        {accountError && (
          <span className={styles.errorText}>{accountError}</span>
        )}
      </div>

      <div className={styles.inputWrapper}>
        <div
          className={`${styles.inputGroup} ${
            nicknameError ? styles.inputError : ''
          }`}
        >
          <SmileOutlined className={styles.inputIcon} />
          <input
            type="text"
            className={styles.input}
            placeholder={intl.formatMessage({
              id: 'signUp.nicknamePlaceholder',
              defaultMessage: '请输入昵称',
            })}
            value={nickname}
            onChange={handleNicknameChange}
            onBlur={() => validateNickname(nickname)}
          />
        </div>
        {nicknameError && (
          <span className={styles.errorText}>{nicknameError}</span>
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
            type={showPassword ? 'text' : 'password'}
            className={styles.input}
            placeholder={intl.formatMessage({
              id: 'signUp.passwordPlaceholder',
              defaultMessage: '请输入密码',
            })}
            value={password}
            onChange={handlePasswordChange}
            onBlur={() => validatePassword(password)}
          />
          <span
            className={styles.passwordToggle}
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <EyeInvisibleOutlined /> : <EyeOutlined />}
          </span>
        </div>
        {passwordError && (
          <span className={styles.errorText}>{passwordError}</span>
        )}
      </div>

      <button
        className={styles.submitBtn}
        onClick={onFinish}
        disabled={loading}
      >
        {loading ? (
          <span className={styles.loadingDot}>...</span>
        ) : (
          intl.formatMessage({ id: 'signUp.submit', defaultMessage: '注册' })
        )}
      </button>
    </div>
  );
};

export default FastSignUp;
