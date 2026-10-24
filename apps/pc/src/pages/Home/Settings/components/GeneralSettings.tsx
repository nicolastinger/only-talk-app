import { useTheme } from '@/hooks/useTheme';
import {
  CheckCircleFilled,
  DownloadOutlined,
  FontSizeOutlined,
  GlobalOutlined,
  PictureOutlined,
  PoweroffOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';
import { getLocale, setLocale, useIntl } from '@umijs/max';
import {
  deleteChatBackground,
  getAutoDownloadOnWifi,
  importChatBackground,
  listChatBackgrounds,
  pickChatBackgroundImage,
  resolveChatBackgroundUrl,
  setActiveChatBackground,
  setAppLanguage,
  setAutoDownloadOnWifi,
  type ChatBackgroundVo,
} from '@workspace/services';
import {
  Button,
  Card,
  Checkbox,
  Divider,
  Popconfirm,
  Select,
  Switch,
  Typography,
  message,
} from 'antd';
import { useEffect, useState } from 'react';
import styles from '../Settings.less';

const { Title, Text } = Typography;
const { Option } = Select;

const GeneralSettings = () => {
  const intl = useIntl();
  const currentLocale = getLocale();
  const { mode, fontSize, setMode, setFontSize } = useTheme();
  const [autoStartEnabled, setAutoStartEnabled] = useState(false);
  const [autoStartLoading, setAutoStartLoading] = useState(false);
  const [autoDownloadWifi, setAutoDownloadWifi] = useState(true);
  // 聊天背景(仅客户端): 历史记录 + 当前生效项
  const [backgrounds, setBackgrounds] = useState<ChatBackgroundVo[]>([]);
  const [backgroundUploading, setBackgroundUploading] = useState(false);

  // 读取当前系统注册的开机自启状态，默认不启用
  useEffect(() => {
    isEnabled()
      .then(setAutoStartEnabled)
      .catch((e) => {
        console.log('获取开机自启状态失败', e);
        setAutoStartEnabled(false);
      });
  }, []);

  // 读取「WiFi 下自动下载图片和视频」开关，默认开启
  useEffect(() => {
    getAutoDownloadOnWifi()
      .then(setAutoDownloadWifi)
      .catch(() => {});
  }, []);

  const handleAutoDownloadChange = (checked: boolean) => {
    setAutoDownloadWifi(checked);
    setAutoDownloadOnWifi(checked).catch(() => {});
  };

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
    setAppLanguage(value).catch(() => {});
  };

  const refreshBackgrounds = () => {
    listChatBackgrounds()
      .then(setBackgrounds)
      .catch(() => {});
  };

  useEffect(() => {
    refreshBackgrounds();
  }, []);

  const handleBackgroundUpload = async () => {
    const path = await pickChatBackgroundImage();
    if (!path) return;
    setBackgroundUploading(true);
    try {
      await importChatBackground(path);
      refreshBackgrounds();
      message.success(
        intl.formatMessage({
          id: 'settings.generalSettings.chatBackgroundApplied',
        }),
      );
    } catch (e) {
      console.log('设置聊天背景失败', e);
      message.error(
        intl.formatMessage({
          id: 'settings.generalSettings.chatBackgroundApplyFailed',
        }),
      );
    } finally {
      setBackgroundUploading(false);
    }
  };

  const handleBackgroundSelect = async (id: number) => {
    try {
      await setActiveChatBackground(id);
      refreshBackgrounds();
    } catch (e) {
      console.log('切换聊天背景失败', e);
      message.error(
        intl.formatMessage({
          id: 'settings.generalSettings.chatBackgroundApplyFailed',
        }),
      );
    }
  };

  const handleBackgroundReset = async () => {
    try {
      await setActiveChatBackground(null);
      refreshBackgrounds();
    } catch (e) {
      console.log('恢复默认聊天背景失败', e);
      message.error(
        intl.formatMessage({
          id: 'settings.generalSettings.chatBackgroundApplyFailed',
        }),
      );
    }
  };

  const handleBackgroundDelete = async (id: number) => {
    try {
      await deleteChatBackground(id);
      refreshBackgrounds();
    } catch (e) {
      console.log('删除聊天背景失败', e);
      message.error(
        intl.formatMessage({
          id: 'settings.generalSettings.chatBackgroundApplyFailed',
        }),
      );
    }
  };

  const activeBackground = backgrounds.find((item) => item.is_active);

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
        <Select
          value={mode}
          onChange={(value) => setMode(value)}
          className={styles.select}
        >
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
        <Select
          value={fontSize}
          onChange={setFontSize}
          className={styles.select}
        >
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
          <PictureOutlined className={styles.cardIcon} />
          <Text strong>
            {intl.formatMessage({
              id: 'settings.generalSettings.chatBackground',
            })}
          </Text>
        </div>
        <Divider className={styles.divider} />

        {/* 预览: 背景铺进一个"假聊天窗口", 直接看消息气泡在背景上的可读性 */}
        <div
          className={`${styles.bgStage} ${
            activeBackground ? '' : styles.bgStageBlank
          }`}
        >
          {activeBackground ? (
            <>
              <img
                className={styles.bgStageImg}
                src={resolveChatBackgroundUrl(activeBackground.file_path)}
                alt=""
              />
              <span className={styles.bgStageScrim} />
              <span className={styles.bgStageChip}>
                {intl.formatMessage({
                  id: 'settings.generalSettings.chatBackgroundInUse',
                })}
              </span>
              <span className={styles.bgBubbles}>
                <span className={`${styles.bgBubble} ${styles.bgBubbleIn}`} />
                <span className={`${styles.bgBubble} ${styles.bgBubbleOut}`} />
                <span
                  className={`${styles.bgBubble} ${styles.bgBubbleIn} ${styles.bgBubbleShort}`}
                />
              </span>
              <div className={styles.bgStageActions}>
                <Button
                  size="small"
                  type="primary"
                  icon={<UploadOutlined />}
                  loading={backgroundUploading}
                  onClick={handleBackgroundUpload}
                >
                  {intl.formatMessage({
                    id: backgroundUploading
                      ? 'settings.generalSettings.chatBackgroundUploading'
                      : 'settings.generalSettings.chatBackgroundUpload',
                  })}
                </Button>
                <Button
                  size="small"
                  className={styles.bgGhostBtn}
                  onClick={handleBackgroundReset}
                >
                  {intl.formatMessage({
                    id: 'settings.generalSettings.chatBackgroundReset',
                  })}
                </Button>
              </div>
            </>
          ) : (
            <div className={styles.bgStageEmpty}>
              <PictureOutlined className={styles.bgStageEmptyIcon} />
              <span className={styles.bgStageEmptyText}>
                {intl.formatMessage({
                  id: 'settings.generalSettings.chatBackgroundEmpty',
                })}
              </span>
              <Button
                type="primary"
                icon={<UploadOutlined />}
                loading={backgroundUploading}
                onClick={handleBackgroundUpload}
              >
                {intl.formatMessage({
                  id: backgroundUploading
                    ? 'settings.generalSettings.chatBackgroundUploading'
                    : 'settings.generalSettings.chatBackgroundUpload',
                })}
              </Button>
            </div>
          )}
        </div>

        {backgrounds.length > 0 && (
          <>
            <div className={styles.bgStripLabel}>
              {intl.formatMessage({
                id: 'settings.generalSettings.chatBackgroundHistory',
              })}
            </div>
            <div className={styles.bgStrip}>
              {backgrounds.map((item) => (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  className={`${styles.bgThumbItem} ${
                    item.is_active ? styles.bgThumbActive : ''
                  }`}
                  onClick={() => handleBackgroundSelect(item.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleBackgroundSelect(item.id);
                    }
                  }}
                >
                  <img
                    className={styles.bgThumbImg}
                    src={resolveChatBackgroundUrl(item.file_path)}
                    alt=""
                  />
                  {item.is_active && (
                    <CheckCircleFilled className={styles.bgThumbCheck} />
                  )}
                  <Popconfirm
                    title={intl.formatMessage({
                      id: 'settings.generalSettings.chatBackgroundDeleteConfirm',
                    })}
                    onConfirm={() => handleBackgroundDelete(item.id)}
                  >
                    <button
                      type="button"
                      className={styles.bgThumbDelete}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={intl.formatMessage({ id: 'common.delete' })}
                    >
                      ×
                    </button>
                  </Popconfirm>
                </div>
              ))}
            </div>
          </>
        )}

        <Text type="secondary" className={styles.description}>
          {intl.formatMessage({
            id: 'settings.generalSettings.chatBackgroundDesc',
          })}
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
        <Checkbox
          checked={autoDownloadWifi}
          onChange={(e) => handleAutoDownloadChange(e.target.checked)}
          className={styles.settingCheckbox}
        >
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
