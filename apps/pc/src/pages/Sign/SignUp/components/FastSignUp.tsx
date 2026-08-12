import {
  EyeInvisibleOutlined,
  EyeOutlined,
  LockOutlined,
  MailOutlined,
  SafetyCertificateOutlined,
  SmileOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import {
  send_verify_code,
  sign_up,
} from '@workspace/services';
import { RustResponse, SignUpRequest } from '@workspace/types';
import { message } from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import styles from '../index.less';

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
// 与后端 PASSWORD_REGEX 保持一致:14 位以上字母或数字
const PASSWORD_REGEX = /^[a-zA-Z\d]{14,}$/;

const FastSignUp: React.FC = () => {
  const intl = useIntl();
  const [loading, setLoading] = useState(false);
  const [account, setAccount] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [nicknameError, setNicknameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [codeError, setCodeError] = useState('');
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startCountdown = (seconds: number) => {
    setCountdown(seconds);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const validateAccount = (value: string): boolean => {
    if (!value) {
      setAccountError(intl.formatMessage({ id: 'signUp.accountRequired' }));
      return false;
    }
    if (value.length < 5) {
      setAccountError(intl.formatMessage({ id: 'signUp.accountMinLength' }));
      return false;
    }
    setAccountError('');
    return true;
  };

  const validateNickname = (value: string): boolean => {
    if (!value) {
      setNicknameError(intl.formatMessage({ id: 'signUp.nicknameRequired' }));
      return false;
    }
    if (value.length < 5) {
      setNicknameError(intl.formatMessage({ id: 'signUp.nicknameMinLength' }));
      return false;
    }
    setNicknameError('');
    return true;
  };

  const validatePassword = (value: string): boolean => {
    if (!value) {
      setPasswordError(intl.formatMessage({ id: 'signUp.passwordRequired' }));
      return false;
    }
    if (!PASSWORD_REGEX.test(value)) {
      setPasswordError(intl.formatMessage({ id: 'signUp.passwordPattern' }));
      return false;
    }
    setPasswordError('');
    return true;
  };

  const validateEmail = (value: string): boolean => {
    if (!value) {
      setEmailError(intl.formatMessage({ id: 'signUp.emailRequired' }));
      return false;
    }
    if (!EMAIL_REGEX.test(value)) {
      setEmailError(intl.formatMessage({ id: 'signUp.emailPattern' }));
      return false;
    }
    setEmailError('');
    return true;
  };

  const validateCode = (value: string): boolean => {
    if (!value) {
      setCodeError(intl.formatMessage({ id: 'signUp.codeRequired' }));
      return false;
    }
    if (!/^\d{6}$/.test(value)) {
      setCodeError(intl.formatMessage({ id: 'signUp.codePattern' }));
      return false;
    }
    setCodeError('');
    return true;
  };

  const handleAccountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setAccount(value);
    if (accountError) validateAccount(value);
  };

  const handleNicknameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNickname(value);
    if (nicknameError) validateNickname(value);
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPassword(value);
    if (passwordError) validatePassword(value);
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);
    if (emailError) validateEmail(value);
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setVerificationCode(value);
    if (codeError) validateCode(value);
  };

  /** 展示后端返回的具体错误信息 */
  const showBackendError = (res: RustResponse) => {
    let msg = intl.formatMessage({ id: 'signUp.failed' });
    try {
      const body = JSON.parse(res.res.body);
      if (body && typeof body.message === 'string' && body.message) {
        msg = body.message;
      }
    } catch {
      /* 非 JSON 响应时使用默认文案 */
    }
    message.error(msg);
  };

  const handleSendCode = async () => {
    if (!validateEmail(email)) return;
    setLoading(true);
    try {
      const res = await send_verify_code({ email });
      if (res.netSuccess && res.res.status === 200) {
        message.success(intl.formatMessage({ id: 'signUp.sendCodeSuccess' }));
        startCountdown(60);
      } else {
        showBackendError(res);
      }
    } catch {
      message.error(intl.formatMessage({ id: 'signUp.sendCodeFail' }));
    } finally {
      setLoading(false);
    }
  };

  const onFinish = async () => {
    const isAccountValid = validateAccount(account);
    const isNicknameValid = validateNickname(nickname);
    const isPasswordValid = validatePassword(password);
    const isEmailValid = validateEmail(email);
    const isCodeValid = validateCode(verificationCode);

    if (!isAccountValid || !isNicknameValid || !isPasswordValid || !isEmailValid || !isCodeValid) {
      return;
    }

    setLoading(true);

    try {
      const signUpRequest: SignUpRequest = {
        account,
        username: nickname,
        password,
        email,
        verification_code: verificationCode,
      };
      const res = await sign_up(signUpRequest);
      if (res.netSuccess && res.res.status === 200) {
        message.success(
          intl.formatMessage({ id: 'signUp.success' }, { username: nickname }),
        );
      } else {
        showBackendError(res);
      }
    } catch (error) {
      message.error(intl.formatMessage({ id: 'signUp.failed' }));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onFinish();
  };

  return (
    <div className={styles.formInner} onKeyDown={handleKeyDown}>
      <div className={styles.inputWrapper}>
        <div className={`${styles.inputGroup} ${accountError ? styles.inputError : ''}`}>
          <UserOutlined className={styles.inputIcon} />
          <input
            type="text"
            className={styles.input}
            placeholder={intl.formatMessage({ id: 'signUp.accountPlaceholder' })}
            value={account}
            onChange={handleAccountChange}
            onBlur={() => validateAccount(account)}
          />
        </div>
        {!accountError && (
          <span className={styles.hintText}>
            {intl.formatMessage({ id: 'signUp.accountHint' })}
          </span>
        )}
        {accountError && <span className={styles.errorText}>{accountError}</span>}
      </div>

      <div className={styles.inputWrapper}>
        <div className={`${styles.inputGroup} ${nicknameError ? styles.inputError : ''}`}>
          <SmileOutlined className={styles.inputIcon} />
          <input
            type="text"
            className={styles.input}
            placeholder={intl.formatMessage({ id: 'signUp.nicknamePlaceholder' })}
            value={nickname}
            onChange={handleNicknameChange}
            onBlur={() => validateNickname(nickname)}
          />
        </div>
        {!nicknameError && (
          <span className={styles.hintText}>
            {intl.formatMessage({ id: 'signUp.nicknameHint' })}
          </span>
        )}
        {nicknameError && <span className={styles.errorText}>{nicknameError}</span>}
      </div>

      <div className={styles.inputWrapper}>
        <div className={`${styles.inputGroup} ${passwordError ? styles.inputError : ''}`}>
          <LockOutlined className={styles.inputIcon} />
          <input
            type={showPassword ? 'text' : 'password'}
            className={styles.input}
            placeholder={intl.formatMessage({ id: 'signUp.passwordPlaceholder' })}
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
        {!passwordError && (
          <span className={styles.hintText}>
            {intl.formatMessage({ id: 'signUp.passwordHint' })}
          </span>
        )}
        {passwordError && <span className={styles.errorText}>{passwordError}</span>}
      </div>

      <div className={styles.inputWrapper}>
        <div className={`${styles.inputGroup} ${emailError ? styles.inputError : ''}`}>
          <MailOutlined className={styles.inputIcon} />
          <input
            type="email"
            className={styles.input}
            placeholder={intl.formatMessage({ id: 'signUp.emailPlaceholder' })}
            value={email}
            onChange={handleEmailChange}
            onBlur={() => validateEmail(email)}
          />
        </div>
        {!emailError && (
          <span className={styles.hintText}>
            {intl.formatMessage({ id: 'signUp.emailHint' })}
          </span>
        )}
        {emailError && <span className={styles.errorText}>{emailError}</span>}
      </div>

      <div className={styles.inputWrapper}>
        <div
          className={`${styles.inputGroup} ${styles.inputGroupCode} ${
            codeError ? styles.inputError : ''
          }`}
        >
          <SafetyCertificateOutlined className={styles.inputIcon} />
          <input
            type="text"
            className={styles.input}
            placeholder={intl.formatMessage({ id: 'signUp.codePlaceholder' })}
            value={verificationCode}
            onChange={handleCodeChange}
            onBlur={() => validateCode(verificationCode)}
          />
          <button
            className={styles.codeBtn}
            onClick={handleSendCode}
            disabled={loading || countdown > 0}
          >
            {countdown > 0
              ? intl.formatMessage({ id: 'signUp.resend' }, { seconds: countdown })
              : intl.formatMessage({ id: 'signUp.sendCode' })}
          </button>
        </div>
        {!codeError && (
          <span className={styles.hintText}>
            {intl.formatMessage({ id: 'signUp.codeHint' })}
          </span>
        )}
        {codeError && <span className={styles.errorText}>{codeError}</span>}
      </div>

      <button
        className={styles.submitBtn}
        onClick={onFinish}
        disabled={loading}
      >
        {loading ? (
          <span className={styles.loadingDot}>...</span>
        ) : (
          intl.formatMessage({ id: 'signUp.submit' })
        )}
      </button>
    </div>
  );
};

export default FastSignUp;
