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
import { useIntl } from '@umijs/max';
import React, { useEffect, useState } from 'react';
import styles from './index.less';

const { Text, Title } = Typography;
const TIMEOUT_MS = 30000;

interface UserInfoModalProps {
  visible: boolean;
  onClose: () => void;
}

const UserInfoModal: React.FC<UserInfoModalProps> = ({ visible, onClose }) => {
  const intl = useIntl();
  const userInfo = useBearStore((state) => state.userInfo);
  const setUserInfo = useBearStore((state) => state.setUserInfo);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const genderMap: { [key: number]: { label: string; icon: React.ReactNode } } = {
    0: { label: intl.formatMessage({ id: 'userInfo.genderTypes.unknown' }), icon: <UserOutlined /> },
    1: { label: intl.formatMessage({ id: 'userInfo.genderTypes.secret' }), icon: <UserOutlined /> },
    2: { label: intl.formatMessage({ id: 'userInfo.genderTypes.male' }), icon: <ManOutlined style={{ color: '#1890ff' }} /> },
    3: { label: intl.formatMessage({ id: 'userInfo.genderTypes.female' }), icon: <WomanOutlined style={{ color: '#eb2f96' }} /> },
    4: { label: intl.formatMessage({ id: 'userInfo.genderTypes.robot' }), icon: <UserOutlined /> },
    5: { label: intl.formatMessage({ id: 'userInfo.genderTypes.other' }), icon: <UserOutlined /> },
  };

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
          setTimeout(() => reject(new Error(intl.formatMessage({ id: 'userInfo.avatar.compressTimeout' }))), TIMEOUT_MS),
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
          setTimeout(() => reject(new Error(intl.formatMessage({ id: 'userInfo.avatar.uploadTimeout' }))), TIMEOUT_MS),
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
            message.success(intl.formatMessage({ id: 'userInfo.avatar.updateSuccess' }));
          } else {
            message.error(intl.formatMessage({ id: 'userInfo.avatar.getFileFailed' }));
          }
        } else {
          message.error(responseBody.msg || intl.formatMessage({ id: 'userInfo.avatar.uploadFailed' }));
        }
      } else {
        message.error(intl.formatMessage({ id: 'userInfo.avatar.uploadFailed' }));
      }
    } catch (error: any) {
      console.error('头像更新失败:', error);
      message.error(error.message || intl.formatMessage({ id: 'userInfo.avatar.updateFailed' }));
      window.dispatchEvent(new CustomEvent('uploadEnd'));
    } finally {
      setLoading(false);
      setPreviewUrl(null);
    }
  };

  const formatBirthday = (timestamp?: number) => {
    if (!timestamp) return intl.formatMessage({ id: 'userInfo.notSet' });
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('zh-CN');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success(intl.formatMessage({ id: 'userInfo.copied' }));
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
            {userInfo?.username || intl.formatMessage({ id: 'userInfo.unknown' })}
          </Title>
          {userInfo?.info && (
            <Text type="secondary" className={styles.bio}>
              {userInfo.info}
            </Text>
          )}
        </div>

        <div className={styles.infoSection}>
          <div className={styles.infoItem}>
            <span className={styles.label}>{intl.formatMessage({ id: 'userInfo.account' })}</span>
            <span className={styles.value}>{userInfo?.account || '-'}</span>
          </div>

          <div className={styles.infoItem}>
            <span className={styles.label}>UUID</span>
            <span
              className={`${styles.value} ${styles.uuidValue}`}
              onClick={() => userInfo?.uuid && copyToClipboard(userInfo.uuid)}
              title={intl.formatMessage({ id: 'userInfo.clickToCopy' })}
            >
              {userInfo?.uuid || '-'}
            </span>
          </div>

          <div className={styles.infoItem}>
            <span className={styles.label}>{intl.formatMessage({ id: 'userInfo.gender' })}</span>
            <span className={styles.value}>
              {userInfo?.gender !== undefined
                ? genderMap[userInfo.gender]?.label
                : '-'}
            </span>
          </div>

          <div className={styles.infoItem}>
            <span className={styles.label}>{intl.formatMessage({ id: 'userInfo.age' })}</span>
            <span className={styles.value}>{userInfo?.age || '-'}</span>
          </div>

          <Collapse
            className={styles.collapse}
            ghost
            items={[
              {
                key: '1',
                label: intl.formatMessage({ id: 'userInfo.moreInfo' }),
                children: (
                  <>
                    <div className={styles.infoItem}>
                      <span className={styles.label}>{intl.formatMessage({ id: 'userInfo.birthday' })}</span>
                      <span className={styles.value}>
                        {formatBirthday(userInfo?.birthday)}
                      </span>
                    </div>

                    <div className={styles.infoItem}>
                      <span className={styles.label}>{intl.formatMessage({ id: 'userInfo.phone' })}</span>
                      <span className={styles.value}>
                        {userInfo?.phone || '-'}
                      </span>
                    </div>

                    <div className={styles.infoItem}>
                      <span className={styles.label}>{intl.formatMessage({ id: 'userInfo.email' })}</span>
                      <span className={styles.value}>
                        {userInfo?.email || '-'}
                      </span>
                    </div>

                    <div className={styles.infoItem}>
                      <span className={styles.label}>{intl.formatMessage({ id: 'userInfo.address' })}</span>
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
