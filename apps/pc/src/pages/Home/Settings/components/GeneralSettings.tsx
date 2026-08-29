import {
  DownloadOutlined,
  FontSizeOutlined,
  GlobalOutlined,
  PoweroffOutlined,
} from '@ant-design/icons';
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';
import { getLocale, setLocale, useIntl } from '@umijs/max';
import {
  Card,
  Checkbox,
  Divider,
  Select,
  Switch,
  Typography,
  message,
} from 'antd';
import { useEffect, useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import styles from '../Settings.less';

const { Title, Text } = Typography;
const { Option } = Select;

const GeneralSettings = () => {
  const intl = useIntl();
  const currentLocale = getLocale();
  const { mode, fontSize, setMode, setFontSize } = useTheme();
  const [autoStartEnabled, setAutoStartEnabled] = useState(false);
  const [autoStartLoading, setAutoStartLoading] = useState(false);

  // 读取当前系统注册的开机自启状态，默认不启用
  useEffect(() => {
    isEnabled()
      .then(setAutoStartEnabled)
      .catch((e) => {
        console.log('获取开机自启状态失败', e);
        setAutoStartEnabled(false);
      });
  }, []);

  const handleAutoStartChange = async (checked: boolean) => {
    setAutoStartLoading(true);
    try {
      if (checked) {
        await enable();
      } else {
        await disable();
      }
      setAutoStartEnabled(checked);
    } catch (e) {
      console.log('修改开机自启设置失败', e);
      message.error(
        intl.formatMessage({ id: 'settings.generalSettings.autoStartFailed' }),
      );
    } finally {
      setAutoStartLoading(false);
    }
  };

  const handleLanguageChange = (value: string) => {
    setLocale(value, false);
  };

  return (
    <div className={styles.settingSection}>
      <Title level={3} className={styles.sectionTitle}>
        {intl.formatMessage({ id: 'settings.generalSettings.title' })}
      </Title>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <PoweroffOutlined className={styles.cardIcon} />
          <Text strong>
            {intl.formatMessage({ id: 'settings.generalSettings.autoStart' })}
          </Text>
        </div>
        <Divider className={styles.divider} />
        <Switch
          checked={autoStartEnabled}
          loading={autoStartLoading}
          onChange={handleAutoStartChange}
          className={styles.settingSwitch}
        />
        <Text type="secondary" className={styles.description}>
          {intl.formatMessage({ id: 'settings.generalSettings.autoStartDesc' })}
        </Text>
      </Card>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <GlobalOutlined className={styles.cardIcon} />
          <Text strong>
            {intl.formatMessage({ id: 'settings.generalSettings.language' })}
          </Text>
        </div>
        <Divider className={styles.divider} />
        <Select
          value={currentLocale}
          onChange={handleLanguageChange}
          className={styles.select}
        >
          <Option value="zh-CN">
            {intl.formatMessage({ id: 'language.chinese' })}
          </Option>
          <Option value="zh-TW">
            {intl.formatMessage({ id: 'language.traditional' })}
          </Option>
          <Option value="en-US">English</Option>
        </Select>
        <Text type="secondary" className={styles.description}>
          {intl.formatMessage({ id: 'settings.generalSettings.languageDesc' })}
        </Text>
      </Card>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <FontSizeOutlined className={styles.cardIcon} />
          <Text strong>
            {intl.formatMessage({ id: 'settings.generalSettings.theme' })}
          </Text>
        </div>
        <Divider className={styles.divider} />
        <Select value={mode} onChange={setMode} className={styles.select}>
          <Option value="light">
            {intl.formatMessage({
              id: 'settings.generalSettings.themeModes.light',
            })}
          </Option>
          <Option value="dark">
            {intl.formatMessage({
              id: 'settings.generalSettings.themeModes.dark',
            })}
          </Option>
          <Option value="system">
            {intl.formatMessage({
              id: 'settings.generalSettings.themeModes.system',
            })}
          </Option>
        </Select>
        <Text type="secondary" className={styles.description}>
          {intl.formatMessage({ id: 'settings.generalSettings.themeDesc' })}
        </Text>
      </Card>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <FontSizeOutlined className={styles.cardIcon} />
          <Text strong>
            {intl.formatMessage({ id: 'settings.generalSettings.fontSize' })}
          </Text>
        </div>
        <Divider className={styles.divider} />
        <Select value={fontSize} onChange={setFontSize} className={styles.select}>
          <Option value="small">
            {intl.formatMessage({
              id: 'settings.generalSettings.fontSizes.small',
            })}
          </Option>
          <Option value="medium">
            {intl.formatMessage({
              id: 'settings.generalSettings.fontSizes.medium',
            })}
          </Option>
          <Option value="large">
            {intl.formatMessage({
              id: 'settings.generalSettings.fontSizes.large',
            })}
          </Option>
        </Select>
        <Text type="secondary" className={styles.description}>
          {intl.formatMessage({ id: 'settings.generalSettings.fontSizeDesc' })}
        </Text>
      </Card>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <DownloadOutlined className={styles.cardIcon} />
          <Text strong>
            {intl.formatMessage({
              id: 'settings.generalSettings.autoDownload',
            })}
          </Text>
        </div>
        <Divider className={styles.divider} />
        <Checkbox defaultChecked className={styles.settingCheckbox}>
          {intl.formatMessage({
            id: 'settings.generalSettings.autoDownloadWifi',
          })}
        </Checkbox>
        <Text type="secondary" className={styles.description}>
          {intl.formatMessage({
            id: 'settings.generalSettings.autoDownloadDesc',
          })}
        </Text>
      </Card>
    </div>
  );
};

export default GeneralSettings;
