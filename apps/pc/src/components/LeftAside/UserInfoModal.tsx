import React from 'react';
import { Modal, Avatar, Typography, Divider, Space } from 'antd';
import { UserOutlined, MailOutlined, PhoneOutlined } from '@ant-design/icons';
import { useBearStore } from '@/store/store';
import styles from './index.less';

const { Text, Title } = Typography;

interface UserInfoModalProps {
  visible: boolean;
  onClose: () => void;
}

const UserInfoModal: React.FC<UserInfoModalProps> = ({ visible, onClose }) => {
  const userInfo = useBearStore((state) => state.userInfo);

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      footer={null}
      centered
      width={400}
      className={styles.userModal}
    >
      <div className={styles.modalContent}>
        <div className={styles.avatarSection}>
          <Avatar
            size={80}
            src={userInfo?.icon}
            icon={<UserOutlined />}
            className={styles.largeAvatar}
          />
          <Title level={4} className={styles.username}>
            {userInfo?.username || '未知用户'}
          </Title>
        </div>

        <Divider />

        <div className={styles.infoSection}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div className={styles.infoItem}>
              <MailOutlined className={styles.infoIcon} />
              <Text strong>邮箱:</Text>
              <Text type="secondary" className={styles.infoText}>
                {userInfo?.email || '未设置'}
              </Text>
            </div>
            
            <div className={styles.infoItem}>
              <PhoneOutlined className={styles.infoIcon} />
              <Text strong>电话:</Text>
              <Text type="secondary" className={styles.infoText}>
                {userInfo?.phone || '未设置'}
              </Text>
            </div>
            
            <div className={styles.infoItem}>
              <UserOutlined className={styles.infoIcon} />
              <Text strong>账号:</Text>
              <Text type="secondary" className={styles.infoText}>
                {userInfo?.account || '未知'}
              </Text>
            </div>
            
            <div className={styles.infoItem}>
              <UserOutlined className={styles.infoIcon} />
              <Text strong>用户ID:</Text>
              <Text type="secondary" className={styles.infoText}>
                {userInfo?.uuid || '未知'}
              </Text>
            </div>
          </Space>
        </div>
      </div>
    </Modal>
  );
};

export default UserInfoModal;