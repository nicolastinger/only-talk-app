import { useIntl } from '@umijs/max';
import {
  change_password,
  change_password_send_code,
  list_auth_factors,
} from '@workspace/services';
import { AuthFactorType, type AuthFactorVO } from '@workspace/types';
import { Button, Input, Modal, Space, Typography, message } from 'antd';
import { useEffect, useRef, useState } from 'react';

const { Text } = Typography;

// 与后端 PASSWORD_REGEX 一致: 14 位以上的字母或数字
const PASSWORD_REGEX = /^[a-zA-Z\d]{14,}$/;

interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
  /** 未绑定邮箱因素时, 点击"去绑定"的回调 */
  onGoBind: () => void;
}

const ChangePasswordModal = ({
  open,
  onClose,
  onGoBind,
}: ChangePasswordModalProps) => {
  const intl = useIntl();
  const [messageApi, contextHolder] = message.useMessage();
  const [emailFactor, setEmailFactor] = useState<AuthFactorVO | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const t = (id: string) =>
    intl.formatMessage({ id: `settings.changePassword.${id}` });

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const resetForm = () => {
    setCode('');
    setNewPassword('');
    setConfirmPassword('');
    setCountdown(0);
    clearTimer();
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoaded(false);
    (async () => {
      try {
        const data = await list_auth_factors();
        if (cancelled) return;
        setEmailFactor(
          data.list.find((f) => f.factor_type === AuthFactorType.EMAIL) ?? null,
        );
      } catch (e) {
        console.log('加载二次认证因素失败', e);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
      clearTimer();
    };
  }, [open]);

  const startCountdown = () => {
    setCountdown(60);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearTimer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const onSendCode = async () => {
    setSending(true);
    try {
      await change_password_send_code({ factor_type: AuthFactorType.EMAIL });
      messageApi.success(t('codeSent'));
      startCountdown();
    } catch (e) {
      messageApi.error((e as Error).message || t('sendFailed'));
    } finally {
      setSending(false);
    }
  };

  const onSubmit = async () => {
    if (!code.trim()) {
      messageApi.warning(t('emptyCode'));
      return;
    }
    if (!PASSWORD_REGEX.test(newPassword)) {
      messageApi.warning(t('invalidPassword'));
      return;
    }
    if (newPassword !== confirmPassword) {
      messageApi.warning(t('passwordMismatch'));
      return;
    }
    setSubmitting(true);
    try {
      await change_password({
        factor_type: AuthFactorType.EMAIL,
        verification_code: code.trim(),
        new_password: newPassword,
      });
      messageApi.success(t('success'));
      resetForm();
      onClose();
    } catch (e) {
      messageApi.error((e as Error).message || t('failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const maskedEmail = (() => {
    const value = emailFactor?.factor_value || '';
    const at = value.indexOf('@');
    if (at <= 1) return value;
    return `${value.slice(0, 2)}***${value.slice(at)}`;
  })();

  return (
    <Modal title={t('title')} open={open} onCancel={handleClose} footer={null}>
      {contextHolder}
      {loaded && !emailFactor ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Text>{t('needBind')}</Text>
          <Button
            type="primary"
            onClick={() => {
              handleClose();
              onGoBind();
            }}
          >
            {t('goBind')}
          </Button>
        </Space>
      ) : emailFactor ? (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div>
            <Text type="secondary">{t('verifyBy')}: </Text>
            <Text>{maskedEmail}</Text>
          </div>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t('codePlaceholder')}
              maxLength={6}
            />
            <Button
              onClick={onSendCode}
              loading={sending}
              disabled={countdown > 0}
            >
              {countdown > 0 ? `${countdown}s` : t('sendCode')}
            </Button>
          </Space.Compact>
          <Input.Password
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={t('newPasswordPlaceholder')}
          />
          <Input.Password
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t('confirmPasswordPlaceholder')}
          />
          <Button type="primary" block onClick={onSubmit} loading={submitting}>
            {t('submit')}
          </Button>
        </Space>
      ) : null}
    </Modal>
  );
};

export default ChangePasswordModal;
