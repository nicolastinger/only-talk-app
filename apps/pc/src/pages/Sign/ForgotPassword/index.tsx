import LanguageSwitcher from '@/components/LanguageSwitch';
import { FormattedMessage } from '@@/exports';
import {
  CloseOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  LockOutlined,
  MailOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Window } from '@tauri-apps/api/window';
import { history, useIntl } from '@umijs/max';
import {
  forgot_password_reset,
  forgot_password_send_code,
} from '@workspace/services';
import { AuthFactorType } from '@workspace/types';
import { message } from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import styles from './index.less';

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
// 与后端 PASSWORD_REGEX 一致: 14 位以上字母或数字
const PASSWORD_REGEX = /^[a-zA-Z\d]{14,}$/;

const ForgotPasswordPage: React.FC = () => {
  const intl = useIntl();
  const [account, setAccount] = useState('');
  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [codeError, setCodeError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const t = (id: string) =>
    intl.formatMessage({ id: `forgotPassword.${id}` });

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

  const validateEmail = (value: string): boolean => {
    if (!value) {
      setEmailError(t('emailRequired'));
      return false;
    }
    if (!EMAIL_REGEX.test(value)) {
      setEmailError(t('emailInvalid'));
      return false;
    }
    setEmailError('');
    return true;
  };

  const validateAccount = (value: string): boolean => {
    if (!value) {
      setAccountError(t('accountRequired'));
      return false;
    }
    if (value.length < 5) {
      setAccountError(t('accountTooShort'));
      return false;
    }
    setAccountError('');
    return true;
  };

  const validateCode = (value: string): boolean => {
    if (!value) {
      setCodeError(t('codeRequired'));
      return false;
    }
    if (!/^\d{6}$/.test(value)) {
      setCodeError(t('codeInvalid'));
      return false;
    }
    setCodeError('');
    return true;
  };

  const validatePassword = (value: string): boolean => {
    if (!PASSWORD_REGEX.test(value)) {
      setPasswordError(t('passwordInvalid'));
      return false;
    }
    setPasswordError('');
    return true;
  };

  const validateConfirm = (value: string): boolean => {
    if (value !== newPassword) {
      setConfirmError(t('passwordMismatch'));
      return false;
    }
    setConfirmError('');
    return true;
  };

  const handleSendCode = async () => {
    const isAccountValid = validateAccount(account);
    const isEmailValid = validateEmail(email);
    if (!isAccountValid || !isEmailValid) return;
    setSending(true);
    try {
      await forgot_password_send_code({
        account: account.trim(),
        factor_type: AuthFactorType.EMAIL,
        factor_value: email.trim(),
      });
      message.success(t('codeSent'));
      startCountdown(60);
    } catch (e) {
      message.error((e as Error).message || t('sendFailed'));
    } finally {
      setSending(false);
    }
  };

  const onSubmit = async () => {
    const isAccountValid = validateAccount(account);
    const isEmailValid = validateEmail(email);
    const isCodeValid = validateCode(verificationCode);
    const isPasswordValid = validatePassword(newPassword);
    const isConfirmValid = validateConfirm(confirmPassword);
    if (
      !isAccountValid ||
      !isEmailValid ||
      !isCodeValid ||
      !isPasswordValid ||
      !isConfirmValid
    ) {
      return;
    }
    setSubmitting(true);
    try {
      await forgot_password_reset({
        account: account.trim(),
        factor_type: AuthFactorType.EMAIL,
        factor_value: email.trim(),
        verification_code: verificationCode.trim(),
        new_password: newPassword,
      });
      message.success(t('success'));
      history.push('/signIn');
    } catch (e) {
      message.error((e as Error).message || t('failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onSubmit();
  };

  const closeWindow = async () => {
    await Window.getCurrent().close();
  };

  const goToSignIn = () => {
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

      <div className={styles.content} onKeyDown={handleKeyDown}>
        <div className={styles.avatarSection}>
          <div className={styles.welcomeText}>
            <FormattedMessage id="forgotPassword.title" />
          </div>
        </div>

        <div className={styles.formSection}>
          <div className={styles.formInner}>
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
                    id: 'forgotPassword.accountPlaceholder',
                  })}
                  value={account}
                  onChange={(e) => {
                    setAccount(e.target.value);
                    if (accountError) validateAccount(e.target.value);
                  }}
                  onBlur={() => validateAccount(account)}
                />
              </div>
              {!accountError && (
                <span className={styles.hintText}>
                  {intl.formatMessage({ id: 'forgotPassword.accountHint' })}
                </span>
              )}
              {accountError && (
                <span className={styles.errorText}>{accountError}</span>
              )}
            </div>

            <div className={styles.inputWrapper}>
              <div
                className={`${styles.inputGroup} ${
                  emailError ? styles.inputError : ''
                }`}
              >
                <MailOutlined className={styles.inputIcon} />
                <input
                  type="email"
                  className={styles.input}
                  placeholder={intl.formatMessage({
                    id: 'forgotPassword.emailPlaceholder',
                  })}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) validateEmail(e.target.value);
                  }}
                  onBlur={() => validateEmail(email)}
                />
              </div>
              {!emailError && (
                <span className={styles.hintText}>
                  {intl.formatMessage({ id: 'forgotPassword.emailHint' })}
                </span>
              )}
              {emailError && (
                <span className={styles.errorText}>{emailError}</span>
              )}
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
                  placeholder={intl.formatMessage({
                    id: 'forgotPassword.codePlaceholder',
                  })}
                  value={verificationCode}
                  onChange={(e) => {
                    setVerificationCode(e.target.value);
                    if (codeError) validateCode(e.target.value);
                  }}
                  onBlur={() => validateCode(verificationCode)}
                />
                <button
                  type="button"
                  className={styles.codeBtn}
                  onClick={handleSendCode}
                  disabled={sending || countdown > 0}
                >
                  {countdown > 0
                    ? intl.formatMessage(
                        { id: 'forgotPassword.resend' },
                        { seconds: countdown },
                      )
                    : intl.formatMessage({ id: 'forgotPassword.sendCode' })}
                </button>
              </div>
              {!codeError && (
                <span className={styles.hintText}>
                  {intl.formatMessage({ id: 'forgotPassword.codeHint' })}
                </span>
              )}
              {codeError && <span className={styles.errorText}>{codeError}</span>}
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
                    id: 'forgotPassword.newPasswordPlaceholder',
                  })}
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (passwordError) validatePassword(e.target.value);
                  }}
                  onBlur={() => validatePassword(newPassword)}
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

            <div className={styles.inputWrapper}>
              <div
                className={`${styles.inputGroup} ${
                  confirmError ? styles.inputError : ''
                }`}
              >
                <LockOutlined className={styles.inputIcon} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className={styles.input}
                  placeholder={intl.formatMessage({
                    id: 'forgotPassword.confirmPasswordPlaceholder',
                  })}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (confirmError) validateConfirm(e.target.value);
                  }}
                  onBlur={() => validateConfirm(confirmPassword)}
                />
              </div>
              {confirmError && (
                <span className={styles.errorText}>{confirmError}</span>
              )}
            </div>

            <button
              type="button"
              className={styles.submitBtn}
              onClick={onSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <span className={styles.loadingDot}>...</span>
              ) : (
                intl.formatMessage({ id: 'forgotPassword.submit' })
              )}
            </button>
          </div>
        </div>

        <div className={styles.footerLinks}>
          <a className={styles.link} onClick={goToSignIn}>
            {intl.formatMessage({ id: 'forgotPassword.backToLogin' })}
          </a>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
