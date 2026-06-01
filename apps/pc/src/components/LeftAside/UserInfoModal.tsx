import { DEFAULT_ICON, TALK_API } from '@/constants';
import { useBearStore } from '@/store/store';
import {
  CameraOutlined,
  CheckOutlined,
  CloseOutlined,
  EditOutlined,
  LoadingOutlined,
  ManOutlined,
  UserOutlined,
  WomanOutlined,
} from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { useIntl } from '@umijs/max';
import {
  convertPathToTauriUrl,
  getFiles,
  selectFile,
  update_user_info,
  refresh_user_info,
} from '@workspace/services';
import { UpdateUserDTO } from '@workspace/types';
import {
  Avatar,
  Button,
  Collapse,
  DatePicker,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Spin,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
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
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const genderMap: { [key: number]: { label: string; icon: React.ReactNode } } =
    {
      0: {
        label: intl.formatMessage({ id: 'userInfo.genderTypes.unknown' }),
        icon: <UserOutlined />,
      },
      1: {
        label: intl.formatMessage({ id: 'userInfo.genderTypes.secret' }),
        icon: <UserOutlined />,
      },
      2: {
        label: intl.formatMessage({ id: 'userInfo.genderTypes.male' }),
        icon: <ManOutlined style={{ color: '#1890ff' }} />,
      },
      3: {
        label: intl.formatMessage({ id: 'userInfo.genderTypes.female' }),
        icon: <WomanOutlined style={{ color: '#eb2f96' }} />,
      },
      4: {
        label: intl.formatMessage({ id: 'userInfo.genderTypes.robot' }),
        icon: <UserOutlined />,
      },
      5: {
        label: intl.formatMessage({ id: 'userInfo.genderTypes.other' }),
        icon: <UserOutlined />,
      },
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
          setTimeout(
            () =>
              reject(
                new Error(
                  intl.formatMessage({ id: 'userInfo.avatar.compressTimeout' }),
                ),
              ),
            TIMEOUT_MS,
          ),
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
          setTimeout(
            () =>
              reject(
                new Error(
                  intl.formatMessage({ id: 'userInfo.avatar.uploadTimeout' }),
                ),
              ),
            TIMEOUT_MS,
          ),
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
            message.success(
              intl.formatMessage({ id: 'userInfo.avatar.updateSuccess' }),
            );
          } else {
            message.error(
              intl.formatMessage({ id: 'userInfo.avatar.getFileFailed' }),
            );
          }
        } else {
          message.error(
            responseBody.msg ||
              intl.formatMessage({ id: 'userInfo.avatar.uploadFailed' }),
          );
        }
      } else {
        message.error(
          intl.formatMessage({ id: 'userInfo.avatar.uploadFailed' }),
        );
      }
    } catch (error: any) {
      console.error('头像更新失败:', error);
      message.error(
        error.message ||
          intl.formatMessage({ id: 'userInfo.avatar.updateFailed' }),
      );
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

  const handleEdit = () => {
    setIsEditing(true);
    form.setFieldsValue({
      username: userInfo?.username,
      info: userInfo?.info,
      gender: userInfo?.gender,
      age: userInfo?.age,
      birthday: userInfo?.birthday ? dayjs.unix(userInfo.birthday) : null,
      phone: userInfo?.phone,
      email: userInfo?.email,
      address: userInfo?.address,
    });
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    form.resetFields();
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const updateData: UpdateUserDTO = {};
      if (values.username !== userInfo?.username) {
        updateData.username = values.username;
      }
      if (values.info !== userInfo?.info) {
        updateData.info = values.info;
      }
      if (values.gender !== userInfo?.gender) {
        updateData.gender = Number(values.gender);
      }
      if (values.age !== userInfo?.age) {
        updateData.age = Number(values.age);
      }
      if (values.birthday) {
        const birthdayTimestamp = values.birthday.unix();
        if (birthdayTimestamp !== userInfo?.birthday) {
          updateData.birthday = birthdayTimestamp;
        }
      }
      if (values.phone !== userInfo?.phone) {
        updateData.phone = values.phone;
      }
      if (values.email !== userInfo?.email) {
        updateData.email = values.email;
      }
      if (values.address !== userInfo?.address) {
        updateData.address = values.address;
      }

      if (Object.keys(updateData).length === 0) {
        message.info(intl.formatMessage({ id: 'userInfo.edit.noChanges' }));
        setIsEditing(false);
        return;
      }

      const response = await update_user_info(updateData);

      if (response.netSuccess && response.res.status === 200) {
        const data = JSON.parse(response.res.body);
        if (data.code === 200 || data.code === 204) {
          const updatedUserInfo = await refresh_user_info(userInfo.uuid);
          setUserInfo(updatedUserInfo);
          message.success(
            intl.formatMessage({ id: 'userInfo.edit.updateSuccess' }),
          );
          setIsEditing(false);
        } else {
          message.error(
            data.message ||
              intl.formatMessage({ id: 'userInfo.edit.updateFailed' }),
          );
        }
      } else {
        message.error(
          response.error ||
            intl.formatMessage({ id: 'userInfo.edit.updateFailed' }),
        );
      }
    } catch (error: any) {
      console.error('更新用户信息失败:', error);
      message.error(
        error.message ||
          intl.formatMessage({ id: 'userInfo.edit.updateFailed' }),
      );
    } finally {
      setSaving(false);
    }
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

          {isEditing ? (
            <Form form={form} layout="vertical" className={styles.editForm}>
              <Form.Item
                name="username"
                label={intl.formatMessage({ id: 'userInfo.username' })}
                rules={[
                  {
                    max: 50,
                    message: intl.formatMessage({
                      id: 'userInfo.edit.usernameMaxLength',
                    }),
                  },
                ]}
              >
                <Input
                  placeholder={intl.formatMessage({
                    id: 'userInfo.edit.usernamePlaceholder',
                  })}
                />
              </Form.Item>

              <Form.Item
                name="info"
                label={intl.formatMessage({ id: 'userInfo.info' })}
                rules={[
                  {
                    max: 200,
                    message: intl.formatMessage({
                      id: 'userInfo.edit.infoMaxLength',
                    }),
                  },
                ]}
              >
                <Input.TextArea
                  rows={2}
                  placeholder={intl.formatMessage({
                    id: 'userInfo.edit.infoPlaceholder',
                  })}
                />
              </Form.Item>

              <Form.Item
                name="gender"
                label={intl.formatMessage({ id: 'userInfo.gender' })}
              >
                <Select
                  placeholder={intl.formatMessage({
                    id: 'userInfo.edit.selectGender',
                  })}
                >
                  <Select.Option value={0}>
                    {intl.formatMessage({ id: 'userInfo.genderTypes.unknown' })}
                  </Select.Option>
                  <Select.Option value={1}>
                    {intl.formatMessage({ id: 'userInfo.genderTypes.secret' })}
                  </Select.Option>
                  <Select.Option value={2}>
                    {intl.formatMessage({ id: 'userInfo.genderTypes.male' })}
                  </Select.Option>
                  <Select.Option value={3}>
                    {intl.formatMessage({ id: 'userInfo.genderTypes.female' })}
                  </Select.Option>
                  <Select.Option value={4}>
                    {intl.formatMessage({ id: 'userInfo.genderTypes.robot' })}
                  </Select.Option>
                  <Select.Option value={5}>
                    {intl.formatMessage({ id: 'userInfo.genderTypes.other' })}
                  </Select.Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="age"
                label={intl.formatMessage({ id: 'userInfo.age' })}
              >
                <InputNumber
                  min={0}
                  max={150}
                  style={{ width: '100%' }}
                  placeholder={intl.formatMessage({
                    id: 'userInfo.edit.agePlaceholder',
                  })}
                />
              </Form.Item>

              <Form.Item
                name="birthday"
                label={intl.formatMessage({ id: 'userInfo.birthday' })}
              >
                <DatePicker
                  style={{ width: '100%' }}
                  placeholder={intl.formatMessage({
                    id: 'userInfo.edit.selectBirthday',
                  })}
                />
              </Form.Item>

              <Form.Item
                name="phone"
                label={intl.formatMessage({ id: 'userInfo.phone' })}
                rules={[
                  {
                    pattern: /^1[3-9]\d{9}$/,
                    message: intl.formatMessage({
                      id: 'userInfo.edit.phoneInvalid',
                    }),
                  },
                ]}
              >
                <Input
                  placeholder={intl.formatMessage({
                    id: 'userInfo.edit.phonePlaceholder',
                  })}
                />
              </Form.Item>

              <Form.Item
                name="email"
                label={intl.formatMessage({ id: 'userInfo.email' })}
                rules={[
                  {
                    type: 'email',
                    message: intl.formatMessage({
                      id: 'userInfo.edit.emailInvalid',
                    }),
                  },
                ]}
              >
                <Input
                  placeholder={intl.formatMessage({
                    id: 'userInfo.edit.emailPlaceholder',
                  })}
                />
              </Form.Item>

              <Form.Item
                name="address"
                label={intl.formatMessage({ id: 'userInfo.address' })}
                rules={[
                  {
                    max: 200,
                    message: intl.formatMessage({
                      id: 'userInfo.edit.addressMaxLength',
                    }),
                  },
                ]}
              >
                <Input
                  placeholder={intl.formatMessage({
                    id: 'userInfo.edit.addressPlaceholder',
                  })}
                />
              </Form.Item>
            </Form>
          ) : (
            <>
              <Title level={4} className={styles.username}>
                {userInfo?.username ||
                  intl.formatMessage({ id: 'userInfo.unknown' })}
              </Title>
              {userInfo?.info && (
                <Text type="secondary" className={styles.bio}>
                  {userInfo.info}
                </Text>
              )}
            </>
          )}
        </div>

        {!isEditing && (
          <div className={styles.infoSection}>
            <div className={styles.infoItem}>
              <span className={styles.label}>
                {intl.formatMessage({ id: 'userInfo.account' })}
              </span>
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
              <span className={styles.label}>
                {intl.formatMessage({ id: 'userInfo.gender' })}
              </span>
              <span className={styles.value}>
                {userInfo?.gender !== undefined
                  ? genderMap[userInfo.gender]?.label
                  : '-'}
              </span>
            </div>

            <div className={styles.infoItem}>
              <span className={styles.label}>
                {intl.formatMessage({ id: 'userInfo.age' })}
              </span>
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
                        <span className={styles.label}>
                          {intl.formatMessage({ id: 'userInfo.birthday' })}
                        </span>
                        <span className={styles.value}>
                          {formatBirthday(userInfo?.birthday)}
                        </span>
                      </div>

                      <div className={styles.infoItem}>
                        <span className={styles.label}>
                          {intl.formatMessage({ id: 'userInfo.phone' })}
                        </span>
                        <span className={styles.value}>
                          {userInfo?.phone || '-'}
                        </span>
                      </div>

                      <div className={styles.infoItem}>
                        <span className={styles.label}>
                          {intl.formatMessage({ id: 'userInfo.email' })}
                        </span>
                        <span className={styles.value}>
                          {userInfo?.email || '-'}
                        </span>
                      </div>

                      <div className={styles.infoItem}>
                        <span className={styles.label}>
                          {intl.formatMessage({ id: 'userInfo.address' })}
                        </span>
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
        )}

        <div className={styles.buttonSection}>
          {isEditing ? (
            <>
              <Button
                type="default"
                icon={<CloseOutlined />}
                onClick={handleCancelEdit}
                disabled={saving}
                className={styles.cancelButton}
              >
                {intl.formatMessage({ id: 'userInfo.edit.cancel' })}
              </Button>
              <Button
                type="primary"
                icon={<CheckOutlined />}
                onClick={handleSave}
                loading={saving}
                className={styles.saveButton}
              >
                {intl.formatMessage({ id: 'userInfo.edit.save' })}
              </Button>
            </>
          ) : (
            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={handleEdit}
              className={styles.editButton}
            >
              {intl.formatMessage({ id: 'userInfo.edit.edit' })}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default UserInfoModal;
