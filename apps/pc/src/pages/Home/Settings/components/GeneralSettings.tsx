import {
  DownloadOutlined,
  FontSizeOutlined,
  GlobalOutlined,
} from '@ant-design/icons';
import { Card, Checkbox, Divider, Select, Typography } from 'antd';
import { useIntl, setLocale, getLocale } from '@umijs/max';
import styles from '../Settings.less';

const { Title, Text } = Typography;
const { Option } = Select;

const GeneralSettings = () => {
  const intl = useIntl();
  const currentLocale = getLocale();

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
          <GlobalOutlined className={styles.cardIcon} />
          <Text strong>{intl.formatMessage({ id: 'settings.generalSettings.language' })}</Text>
        </div>
        <Divider className={styles.divider} />
        <Select value={currentLocale} onChange={handleLanguageChange} className={styles.select}>
          <Option value="zh-CN">{intl.formatMessage({ id: 'language.chinese' })}</Option>
          <Option value="zh-TW">{intl.formatMessage({ id: 'language.traditional' })}</Option>
          <Option value="en-US">English</Option>
        </Select>
        <Text type="secondary" className={styles.description}>
          {intl.formatMessage({ id: 'settings.generalSettings.languageDesc' })}
        </Text>
      </Card>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <FontSizeOutlined className={styles.cardIcon} />
          <Text strong>{intl.formatMessage({ id: 'settings.generalSettings.theme' })}</Text>
        </div>
        <Divider className={styles.divider} />
        <Select defaultValue="light" className={styles.select}>
          <Option value="light">{intl.formatMessage({ id: 'settings.generalSettings.themeModes.light' })}</Option>
          <Option value="dark">{intl.formatMessage({ id: 'settings.generalSettings.themeModes.dark' })}</Option>
          <Option value="system">{intl.formatMessage({ id: 'settings.generalSettings.themeModes.system' })}</Option>
        </Select>
        <Text type="secondary" className={styles.description}>
          {intl.formatMessage({ id: 'settings.generalSettings.themeDesc' })}
        </Text>
      </Card>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <FontSizeOutlined className={styles.cardIcon} />
          <Text strong>{intl.formatMessage({ id: 'settings.generalSettings.fontSize' })}</Text>
        </div>
        <Divider className={styles.divider} />
        <Select defaultValue="medium" className={styles.select}>
          <Option value="small">{intl.formatMessage({ id: 'settings.generalSettings.fontSizes.small' })}</Option>
          <Option value="medium">{intl.formatMessage({ id: 'settings.generalSettings.fontSizes.medium' })}</Option>
          <Option value="large">{intl.formatMessage({ id: 'settings.generalSettings.fontSizes.large' })}</Option>
        </Select>
        <Text type="secondary" className={styles.description}>
          {intl.formatMessage({ id: 'settings.generalSettings.fontSizeDesc' })}
        </Text>
      </Card>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <DownloadOutlined className={styles.cardIcon} />
          <Text strong>{intl.formatMessage({ id: 'settings.generalSettings.autoDownload' })}</Text>
        </div>
        <Divider className={styles.divider} />
        <Checkbox defaultChecked className={styles.settingCheckbox}>
          {intl.formatMessage({ id: 'settings.generalSettings.autoDownloadWifi' })}
        </Checkbox>
        <Text type="secondary" className={styles.description}>
          {intl.formatMessage({ id: 'settings.generalSettings.autoDownloadDesc' })}
        </Text>
      </Card>
    </div>
  );
};

export default GeneralSettings;
