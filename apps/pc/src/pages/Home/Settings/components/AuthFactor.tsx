import { LockOutlined } from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import {
  create_auth_factor,
  delete_auth_factor,
  list_auth_factors,
  send_auth_factor_code,
} from '@workspace/services';
import { AuthFactorType, type AuthFactorVO } from '@workspace/types';
import {
  Button,
  Card,
  Divider,
  Input,
  Modal,
  Space,
  Typography,
  message,
} from 'antd';
import { useEffect, useRef, useState } from 'react';
import styles from '../Settings.less';

const { Title, Text } = Typography;

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const AuthFactor = () => {
  const intl = useIntl();
  const [messageApi, contextHolder] = message.useMessage();
  const [emailFactor, setEmailFactor] = useState<AuthFactorVO | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [binding, setBinding] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const t = (id: string, values?: Record<string, string | number>) =>
    intl.formatMessage({ id: `settings.authFactor.${id}` }, values);

  const loadFactors = async () => {
    try {
      const data = await list_auth_factors();
      setEmailFactor(
        data.list.find((f) => f.factor_type === AuthFactorType.EMAIL) ?? null,
      );
    } catch (e) {
      console.log('加载二次认证因素失败', e);
    }
  };

  useEffect(() => {
    loadFactors();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startCountdown = () => {
    setCountdown(60);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const onSendCode = async () => {
    if (!EMAIL_REGEX.test(email.trim())) {
      messageApi.warning(t('invalidEmail'));
      return;
    }
    setSending(true);
    try {
      await send_auth_factor_code({
        factor_type: AuthFactorType.EMAIL,
        factor_value: email.trim(),
      });
      messageApi.success(t('codeSent'));
      startCountdown();
    } catch (e) {
      messageApi.error((e as Error).message || t('bindFailed'));
    } finally {
      setSending(false);
    }
  };

  const onBind = async () => {
    if (!EMAIL_REGEX.test(email.trim())) {
      messageApi.warning(t('invalidEmail'));
      return;
    }
    if (!code.trim()) {
      messageApi.warning(t('emptyCode'));
      return;
    }
    setBinding(true);
    try {
      await create_auth_factor({
        factor_type: AuthFactorType.EMAIL,
        factor_value: email.trim(),
        verification_code: code.trim(),
      });
      messageApi.success(t('bindSuccess'));
      setEmail('');
      setCode('');
      await loadFactors();
    } catch (e) {
      messageApi.error((e as Error).message || t('bindFailed'));
    } finally {
      setBinding(false);
    }
  };

  const onUnbind = () => {
    if (!emailFactor) return;
    const current = emailFactor;
    Modal.confirm({
      title: t('unbindConfirmTitle'),
      content: t('unbindConfirmMsg', { email: current.factor_value }),
      okText: t('unbind'),
      cancelText: intl.formatMessage({ id: 'settings.blacklist.cancel' }),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await delete_auth_factor(current.id);
          messageApi.success(t('unbindSuccess'));
          await loadFactors();
        } catch (e) {
          messageApi.error((e as Error).message || t('unbindFailed'));
        }
      },
    });
  };

  return (
    <div className={styles.settingSection}>
      {contextHolder}
      <Title level={3} className={styles.sectionTitle}>
        {t('title')}
      </Title>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <LockOutlined className={styles.cardIcon} />
          <Text strong>{t('emailSection')}</Text>
        </div>
        <Divider className={styles.divider} />
        {emailFactor ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div>
              <Text>{emailFactor.factor_value}</Text>
              <Text type="success" style={{ marginLeft: 8 }}>
                {t('bound')}
              </Text>
            </div>
            <Button danger onClick={onUnbind}>
              {t('unbind')}
            </Button>
          </Space>
        ) : (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('emailPlaceholder')}
              addonBefore={t('emailLabel')}
              allowClear
            />
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
                {countdown > 0
                  ? t('resend', { seconds: countdown })
                  : t('sendCode')}
              </Button>
            </Space.Compact>
            <Button type="primary" onClick={onBind} loading={binding}>
              {t('bind')}
            </Button>
          </Space>
        )}
      </Card>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <LockOutlined className={styles.cardIcon} />
          <Text strong>{t('otherSection')}</Text>
        </div>
        <Divider className={styles.divider} />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '8px 0',
          }}
        >
          <Text type="secondary">{t('phone')}</Text>
          <Text type="secondary">{t('comingSoon')}</Text>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '8px 0',
          }}
        >
          <Text type="secondary">{t('other')}</Text>
          <Text type="secondary">{t('comingSoon')}</Text>
        </div>
      </Card>

      <Text type="secondary" className={styles.description}>
        {t('tip')}
      </Text>
    </div>
  );
};

export default AuthFactor;
