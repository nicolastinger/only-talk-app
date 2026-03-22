import {
  DownloadOutlined,
  FontSizeOutlined,
  GlobalOutlined,
} from '@ant-design/icons';
import { Card, Checkbox, Divider, Select, Typography } from 'antd';
import styles from '../Settings.less';

const { Title, Text } = Typography;
const { Option } = Select;

const GeneralSettings = () => {
  return (
    <div className={styles.settingSection}>
      <Title level={3} className={styles.sectionTitle}>
        通用设置
      </Title>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <GlobalOutlined className={styles.cardIcon} />
          <Text strong>语言</Text>
        </div>
        <Divider className={styles.divider} />
        <Select defaultValue="简体中文" className={styles.select}>
          <Option value="简体中文">简体中文</Option>
          <Option value="English">English</Option>
        </Select>
        <Text type="secondary" className={styles.description}>
          选择应用显示语言
        </Text>
      </Card>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <FontSizeOutlined className={styles.cardIcon} />
          <Text strong>主题</Text>
        </div>
        <Divider className={styles.divider} />
        <Select defaultValue="浅色模式" className={styles.select}>
          <Option value="浅色模式">浅色模式</Option>
          <Option value="深色模式">深色模式</Option>
          <Option value="跟随系统">跟随系统</Option>
        </Select>
        <Text type="secondary" className={styles.description}>
          选择应用界面主题
        </Text>
      </Card>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <FontSizeOutlined className={styles.cardIcon} />
          <Text strong>字体大小</Text>
        </div>
        <Divider className={styles.divider} />
        <Select defaultValue="中" className={styles.select}>
          <Option value="小">小</Option>
          <Option value="中">中</Option>
          <Option value="大">大</Option>
        </Select>
        <Text type="secondary" className={styles.description}>
          调整聊天文字大小
        </Text>
      </Card>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <DownloadOutlined className={styles.cardIcon} />
          <Text strong>自动下载</Text>
        </div>
        <Divider className={styles.divider} />
        <Checkbox defaultChecked className={styles.settingCheckbox}>
          WiFi环境下自动下载图片和视频
        </Checkbox>
        <Text type="secondary" className={styles.description}>
          节省流量设置
        </Text>
      </Card>
    </div>
  );
};

export default GeneralSettings;
