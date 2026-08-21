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
  complete_profile,
  send_verify_code,
  sign_up_step1,
} from '@workspace/services';
import {
  CompleteProfileRequest,
  RustResponse,
  SignUpStep1Request,
} from '@workspace/types';
import { message } from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import styles from '../index.less';

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
// 与后端 PASSWORD_REGEX 保持一致:14 位以上字母或数字
const PASSWORD_REGEX = /^[a-zA-Z\d]{14,}$/;

const FastSignUp: React.FC = () => {
  const intl = useIntl();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [account, setAccount] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [regToken, setRegToken] = useState('');
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

  /** 判断是否为注册会话 token 失效(过期/不存在), 需回退第一步重新获取验证码 */
  const isTokenExpired = (res: RustResponse): boolean => {
    try {
      const body = JSON.parse(res.res.body);
      if (body && typeof body.message === 'string') {
        return body.message.includes('失效') || body.message.includes('不存在');
      }
    } catch {
      /* 非 JSON 响应时按非 token 失效处理 */
    }
    return false;
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

  const handleNext = async () => {
    const isEmailValid = validateEmail(email);
    const isCodeValid = validateCode(verificationCode);

    if (!isEmailValid || !isCodeValid) {
      return;
    }

    setLoading(true);

    try {
      const step1Request: SignUpStep1Request = {
        email,
        verification_code: verificationCode,
      };
      const res = await sign_up_step1(step1Request);
      if (res.netSuccess && res.res.status === 200) {
        let token = '';
        try {
          const body = JSON.parse(res.res.body);
          token = body?.data?.reg_token ?? '';
        } catch {
          /* 响应非预期 JSON 时按失败处理 */
        }
        if (!token) {
          message.error(intl.formatMessage({ id: 'signUp.failed' }));
          return;
        }
        setRegToken(token);
        setStep(2);
      } else {
        showBackendError(res);
      }
    } catch {
      message.error(intl.formatMessage({ id: 'signUp.failed' }));
    } finally {
      setLoading(false);
    }
  };

  const handlePrev = () => {
    setStep(1);
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
      const completeProfileRequest: CompleteProfileRequest = {
        reg_token: regToken,
        email,
        account,
        password,
        username: nickname,
      };
      const res = await complete_profile(completeProfileRequest);
      if (res.netSuccess && res.res.status === 200) {
        message.success(
          intl.formatMessage({ id: 'signUp.success' }, { username: nickname }),
        );
      } else if (isTokenExpired(res)) {
        message.warning(intl.formatMessage({ id: 'signUp.tokenExpired' }));
        setStep(1);
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
    if (e.key === 'Enter') {
      if (step === 1) {
        handleNext();
      } else {
        onFinish();
      }
    }
  };

  return (
    <div className={styles.formInner} onKeyDown={handleKeyDown}>
      {step === 1 ? (
        <>
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
                  id: 'signUp.emailPlaceholder',
                })}
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
                  id: 'signUp.codePlaceholder',
                })}
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
                  ? intl.formatMessage(
                      { id: 'signUp.resend' },
                      { seconds: countdown },
                    )
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
            onClick={handleNext}
            disabled={loading}
          >
            {loading ? (
              <span className={styles.loadingDot}>...</span>
            ) : (
              intl.formatMessage({ id: 'signUp.next' })
            )}
          </button>
        </>
      ) : (
        <>
          <div className={styles.inputWrapper}>
            <span className={styles.stepEmailLabel}>
              {intl.formatMessage({ id: 'signUp.registerEmail' })}
            </span>
            <div className={styles.stepEmail}>{email}</div>
          </div>

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
                })}
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
                })}
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
            {!passwordError && (
              <span className={styles.hintText}>
                {intl.formatMessage({ id: 'signUp.passwordHint' })}
              </span>
            )}
            {passwordError && (
              <span className={styles.errorText}>{passwordError}</span>
            )}
          </div>

          <div className={styles.btnRow}>
            <button
              className={styles.prevBtn}
              onClick={handlePrev}
              disabled={loading}
            >
              {intl.formatMessage({ id: 'signUp.prev' })}
            </button>
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
        </>
      )}
    </div>
  );
};

export default FastSignUp;
