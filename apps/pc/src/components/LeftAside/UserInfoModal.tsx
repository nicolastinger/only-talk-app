import { TALK_API } from '@/constants';
import { useBearStore } from '@/store/store';
import {
  CameraOutlined,
  LoadingOutlined,
  MailOutlined,
  PhoneOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import {
  convertPathToTauriUrl,
  getFiles,
  selectFile,
} from '@workspace/services';
import { Avatar, Divider, message, Modal, Space, Spin, Typography } from 'antd';
import React, { useEffect, useState } from 'react';
import styles from './index.less';

const { Text, Title } = Typography;
const TIMEOUT_MS = 30000;

interface UserInfoModalProps {
  visible: boolean;
  onClose: () => void;
}

const UserInfoModal: React.FC<UserInfoModalProps> = ({ visible, onClose }) => {
  const userInfo = useBearStore((state) => state.userInfo);
  const setUserInfo = useBearStore((state) => state.setUserInfo);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const getUserIcon = async (icon: string) => {
    try {
      const FileVos = await getFiles(icon);
      const tauriFilePath = FileVos?.[0]?.tauri_file_path || null;
      setAvatarUrl(tauriFilePath);
    } catch (error) {
      console.error('获取头像失败:', error);
      setAvatarUrl(null);
    }
  };

  useEffect(() => {
    if (userInfo?.icon) {
      getUserIcon(userInfo.icon);
    }
  }, [userInfo?.icon]);

  const handleAvatarClick = async () => {
    try {
      const files = await selectFile(false);
      if (!files || files.length === 0) {
        return;
      }

      const filePath = files[0];
      setLoading(true);

      const compressedResult = await Promise.race([
        invoke<string>('compress_image_to_webp_command', {
          inputPath: filePath,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('压缩超时（30秒）')), TIMEOUT_MS),
        ),
      ]);

      const preview = convertPathToTauriUrl(compressedResult);
      if (preview) {
        setPreviewUrl(preview);
      }

      const uploadResult = await Promise.race([
        invoke<{ status: number; body: string }>('upload_file_request', {
          url: `${TALK_API}/file_integrated/upload/user_avatar`,
          filePath: compressedResult,
          fieldName: 'file',
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('上传超时（30秒）')), TIMEOUT_MS),
        ),
      ]);

      if (uploadResult.status === 200) {
        const responseBody = JSON.parse(uploadResult.body);
        if (responseBody.code === 200 && responseBody.data) {
          const bizId = responseBody.data;

          const FileVos = await getFiles(bizId);
          const tauriFilePath = FileVos?.[0]?.tauri_file_path || null;

          if (tauriFilePath) {
            const updatedUserInfo = { ...userInfo, icon: bizId };
            setUserInfo(updatedUserInfo);
            getUserIcon(bizId);
            message.success('头像更新成功');
          } else {
            message.error('获取头像文件失败');
          }
        } else {
          message.error(responseBody.msg || '头像上传失败');
        }
      } else {
        message.error('头像上传失败');
      }
    } catch (error: any) {
      console.error('头像更新失败:', error);
      message.error(error.message || '头像更新失败');
    } finally {
      setLoading(false);
      setPreviewUrl(null);
    }
  };

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
          <div
            className={styles.avatarWrapper}
            onClick={loading ? undefined : handleAvatarClick}
          >
            <Spin
              indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />}
              spinning={loading}
            >
              <Avatar
                size={80}
                src={previewUrl || avatarUrl}
                icon={<UserOutlined />}
                className={styles.largeAvatar}
              />
            </Spin>
            {!loading && (
              <div className={styles.avatarOverlay}>
                <CameraOutlined className={styles.cameraIcon} />
              </div>
            )}
          </div>
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
