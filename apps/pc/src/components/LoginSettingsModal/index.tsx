import { useEffect, useState } from 'react';
import { Input, Modal, Radio, Space, Typography, message } from 'antd';
import { CLIENT_CONFIG_KEYS } from '@workspace/types';
import { getApiBase, setConfig } from '@workspace/services';
import styles from './index.less';

const PRESET_DEV = 'http://127.0.0.1:8443';
const PRESET_PROD = 'https://onlytalk.cn';

type ServerMode = 'dev' | 'prod' | 'custom';

interface LoginSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 登录页设置弹窗(类 QQ 登录页「设置」入口)。
 * 目前提供服务器地址选择: 开发/生产/自定义, 保存到公共库 client_config 的 server.api_base。
 */
const LoginSettingsModal: React.FC<LoginSettingsModalProps> = ({ open, onClose }) => {
  const [mode, setMode] = useState<ServerMode>('prod');
  const [custom, setCustom] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const base = getApiBase();
    if (base === PRESET_DEV) {
      setMode('dev');
      setCustom('');
    } else if (base === PRESET_PROD) {
      setMode('prod');
      setCustom('');
    } else {
      setMode('custom');
      setCustom(base);
    }
  }, [open]);

  const handleOk = async () => {
    const value = mode === 'dev' ? PRESET_DEV : mode === 'prod' ? PRESET_PROD : custom.trim();
    if (!value) {
      message.warning('请输入服务器地址');
      return;
    }
    setSaving(true);
    try {
      await setConfig(CLIENT_CONFIG_KEYS.serverApiBase, value);
      message.success('服务器地址已保存');
      onClose();
    } catch (e) {
      message.error(`保存失败: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="设置"
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={saving}
      okText="保存"
      cancelText="取消"
      width={420}
      destroyOnClose
    >
      <div className={styles.section}>
        <div className={styles.sectionTitle}>服务器设置</div>
        <Radio.Group value={mode} onChange={(e) => setMode(e.target.value as ServerMode)}>
          <Space direction="vertical" size={10}>
            <Radio value="dev">
              开发环境 <span className={styles.hint}>{PRESET_DEV}</span>
            </Radio>
            <Radio value="prod">
              生产环境 <span className={styles.hint}>{PRESET_PROD}</span>
            </Radio>
            <Radio value="custom">自定义</Radio>
          </Space>
        </Radio.Group>
        {mode === 'custom' && (
          <Input
            className={styles.customInput}
            placeholder="https://your-domain.com"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
          />
        )}
        <Typography.Text type="secondary" className={styles.tip}>
          当前生效: {getApiBase()}
        </Typography.Text>
      </div>
    </Modal>
  );
};

export default LoginSettingsModal;