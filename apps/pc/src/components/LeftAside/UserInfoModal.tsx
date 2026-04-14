import { DEFAULT_ICON, TALK_API } from '@/constants';
import { useBearStore } from '@/store/store';
import {
  CameraOutlined,
  EnvironmentOutlined,
  GiftOutlined,
  LoadingOutlined,
  ManOutlined,
  UserOutlined,
  WomanOutlined,
} from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import {
  convertPathToTauriUrl,
  getFiles,
  selectFile,
} from '@workspace/services';
import { Avatar, Collapse, message, Modal, Spin, Typography } from 'antd';
import React, { useEffect, useState } from 'react';
import styles from './index.less';

const { Text, Title } = Typography;
const TIMEOUT_MS = 30000;

const genderMap: { [key: number]: { label: string; icon: React.ReactNode } } = {
  0: { label: '未知', icon: <UserOutlined /> },
  1: { label: '保密', icon: <UserOutlined /> },
  2: { label: '男', icon: <ManOutlined style={{ color: '#1890ff' }} /> },
  3: { label: '女', icon: <WomanOutlined style={{ color: '#eb2f96' }} /> },
  4: { label: '机器人', icon: <UserOutlined /> },
  5: { label: '其他', icon: <UserOutlined /> },
};

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

      window.dispatchEvent(new CustomEvent('uploadStart'));

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

      window.dispatchEvent(new CustomEvent('uploadEnd'));

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
      window.dispatchEvent(new CustomEvent('uploadEnd'));
    } finally {
      setLoading(false);
      setPreviewUrl(null);
    }
  };

  const formatBirthday = (timestamp?: number) => {
    if (!timestamp) return '未设置';
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('zh-CN');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success('已复制到剪贴板');
  };

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      footer={null}
      centered
      width={420}
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
                src={previewUrl || avatarUrl || DEFAULT_ICON}
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
          {userInfo?.info && (
            <Text type="secondary" className={styles.bio}>
              {userInfo.info}
            </Text>
          )}
        </div>

        <div className={styles.infoSection}>
          <div className={styles.infoItem}>
            <span className={styles.label}>账号</span>
            <span className={styles.value}>{userInfo?.account || '-'}</span>
          </div>

          <div className={styles.infoItem}>
            <span className={styles.label}>UUID</span>
            <span
              className={`${styles.value} ${styles.uuidValue}`}
              onClick={() => userInfo?.uuid && copyToClipboard(userInfo.uuid)}
              title="点击复制"
            >
              {userInfo?.uuid || '-'}
            </span>
          </div>

          <div className={styles.infoItem}>
            <span className={styles.label}>性别</span>
            <span className={styles.value}>
              {userInfo?.gender !== undefined
                ? genderMap[userInfo.gender]?.label
                : '-'}
            </span>
          </div>

          <div className={styles.infoItem}>
            <span className={styles.label}>年龄</span>
            <span className={styles.value}>{userInfo?.age || '-'}</span>
          </div>

          <Collapse
            className={styles.collapse}
            ghost
            items={[
              {
                key: '1',
                label: '更多信息',
                children: (
                  <>
                    <div className={styles.infoItem}>
                      <span className={styles.label}>生日</span>
                      <span className={styles.value}>
                        {formatBirthday(userInfo?.birthday)}
                      </span>
                    </div>

                    <div className={styles.infoItem}>
                      <span className={styles.label}>手机</span>
                      <span className={styles.value}>
                        {userInfo?.phone || '-'}
                      </span>
                    </div>

                    <div className={styles.infoItem}>
                      <span className={styles.label}>邮箱</span>
                      <span className={styles.value}>
                        {userInfo?.email || '-'}
                      </span>
                    </div>

                    <div className={styles.infoItem}>
                      <span className={styles.label}>地址</span>
                      <span className={styles.value}>
                        {userInfo?.address || '-'}
                      </span>
                    </div>
                  </>
                ),
              },
            ]}
          />
        </div>
      </div>
    </Modal>
  );
};

export default UserInfoModal;
