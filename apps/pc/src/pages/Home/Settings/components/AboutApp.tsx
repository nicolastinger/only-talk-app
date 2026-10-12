import {
  InfoCircleOutlined,
  MessageOutlined,
  QuestionCircleOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { getVersion } from '@tauri-apps/api/app';
import { useIntl } from '@umijs/max';
import type { UpdateDownloadProgress } from '@workspace/services';
import {
  checkForUpdate,
  downloadUpdatePackage,
  formatFileSize,
  installUpdate,
} from '@workspace/services';
import { UpdateInfo } from '@workspace/types';
import {
  Alert,
  Button,
  Card,
  Divider,
  Modal,
  Progress,
  Typography,
  message,
} from 'antd';
import { useEffect, useState } from 'react';
import styles from '../Settings.less';

const { Title, Text, Paragraph } = Typography;

const AboutApp = () => {
  const intl = useIntl();
  const [version, setVersion] = useState('1.0.0');
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<UpdateDownloadProgress>({
    fileName: '',
    downloaded: 0,
    total: 0,
  });
  const [localPath, setLocalPath] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    getVersion()
      .then((v) => setVersion(v))
      .catch(() => {
        /* 浏览器环境无 Tauri 运行时, 保留静态版本号 */
      });
  }, []);

  const onCheckUpdate = async () => {
    setChecking(true);
    try {
      const result = await checkForUpdate();
      if (!result.hasUpdate || !result.info) {
        message.success(
          intl.formatMessage({ id: 'settings.aboutApp.latestVersion' }),
        );
        return;
      }
      setUpdateInfo(result.info);
      setLocalPath(null);
      setModalOpen(true);
    } catch (e) {
      console.error('检查更新失败:', e);
      message.error(
        intl.formatMessage({ id: 'settings.aboutApp.checkFailed' }),
      );
    } finally {
      setChecking(false);
    }
  };

  const onDownload = async () => {
    if (!updateInfo) return;
    setDownloading(true);
    setProgress({ fileName: updateInfo.file_name, downloaded: 0, total: 0 });
    try {
      const path = await downloadUpdatePackage(updateInfo, setProgress);
      setLocalPath(path);
      message.success(
        intl.formatMessage({ id: 'settings.aboutApp.downloadComplete' }),
      );
    } catch (e) {
      console.error('下载更新失败:', e);
      message.error(
        intl.formatMessage({ id: 'settings.aboutApp.downloadFailed' }),
      );
    } finally {
      setDownloading(false);
    }
  };

  const onInstall = async () => {
    if (!localPath) return;
    setInstalling(true);
    try {
      // Windows 端 install_update 会静默安装并退出进程; Android 端调起系统安装器
      await installUpdate(localPath);
      setModalOpen(false);
    } catch (e) {
      console.error('安装更新失败:', e);
      message.error(
        intl.formatMessage({ id: 'settings.aboutApp.installFailed' }),
      );
    } finally {
      setInstalling(false);
    }
  };

  const forceUpdate = !!updateInfo?.force_update;
  const downloadPercent =
    progress.total > 0
      ? Math.min(100, Math.floor((progress.downloaded / progress.total) * 100))
      : 0;

  return (
    <div className={styles.settingSection}>
      <Title level={3} className={styles.sectionTitle}>
        {intl.formatMessage({ id: 'settings.aboutApp.title' })}
      </Title>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <InfoCircleOutlined className={styles.cardIcon} />
          <Text strong>
            {intl.formatMessage({ id: 'settings.aboutApp.appInfo' })}
          </Text>
        </div>
        <Divider className={styles.divider} />
        <div className={styles.appInfo}>
          <Text type="secondary">
            {intl.formatMessage({ id: 'settings.aboutApp.appName' })}
          </Text>
          <Text>Only Talk</Text>
        </div>
        <div className={styles.appInfo}>
          <Text type="secondary">
            {intl.formatMessage({ id: 'settings.aboutApp.version' })}
          </Text>
          <Text>v{version}</Text>
        </div>
        <div className={styles.appInfo}>
          <Text type="secondary">
            {intl.formatMessage({ id: 'settings.aboutApp.developer' })}
          </Text>
          <Text>UMI Team</Text>
        </div>
        <div className={styles.appInfo}>
          <Text type="secondary">
            {intl.formatMessage({ id: 'settings.aboutApp.copyright' })}
          </Text>
          <Text>© 2023 Only Talk. All rights reserved.</Text>
        </div>
      </Card>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <SyncOutlined className={styles.cardIcon} />
          <Text strong>
            {intl.formatMessage({ id: 'settings.aboutApp.checkUpdate' })}
          </Text>
        </div>
        <Divider className={styles.divider} />
        <Button
          type="primary"
          icon={<SyncOutlined />}
          loading={checking}
          onClick={onCheckUpdate}
        >
          {intl.formatMessage({ id: 'settings.aboutApp.checkNewVersion' })}
        </Button>
      </Card>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <QuestionCircleOutlined className={styles.cardIcon} />
          <Text strong>
            {intl.formatMessage({ id: 'settings.aboutApp.feedbackHelp' })}
          </Text>
        </div>
        <Divider className={styles.divider} />
        <div className={styles.buttonGroup}>
          <Button icon={<MessageOutlined />}>
            {intl.formatMessage({ id: 'settings.aboutApp.feedback' })}
          </Button>
          <Button
            icon={<QuestionCircleOutlined />}
            style={{ marginLeft: '10px' }}
          >
            {intl.formatMessage({ id: 'settings.aboutApp.helpDoc' })}
          </Button>
        </div>
      </Card>

      <Modal
        title={intl.formatMessage(
          { id: 'settings.aboutApp.newVersionAvailable' },
          { version: updateInfo?.version ?? '' },
        )}
        open={modalOpen}
        onOk={localPath ? onInstall : onDownload}
        onCancel={() => {
          if (!forceUpdate) setModalOpen(false);
        }}
        okText={
          downloading
            ? intl.formatMessage({ id: 'settings.aboutApp.downloading' })
            : installing
            ? intl.formatMessage({ id: 'settings.aboutApp.installing' })
            : localPath
            ? intl.formatMessage({ id: 'settings.aboutApp.installNow' })
            : intl.formatMessage({ id: 'settings.aboutApp.downloadNow' })
        }
        cancelText={intl.formatMessage({ id: 'settings.aboutApp.later' })}
        cancelButtonProps={{
          disabled: forceUpdate || downloading || installing,
        }}
        okButtonProps={{ loading: downloading || installing }}
        closable={!forceUpdate}
        maskClosable={!forceUpdate}
        keyboard={!forceUpdate}
        width={480}
        centered
      >
        {forceUpdate && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message={intl.formatMessage({
              id: 'settings.aboutApp.forceUpdate',
            })}
          />
        )}
        <div className={styles.appInfo}>
          <Text type="secondary">
            {intl.formatMessage({ id: 'settings.aboutApp.version' })}
          </Text>
          <Text strong>v{updateInfo?.version}</Text>
        </div>
        <div className={styles.appInfo}>
          <Text type="secondary">
            {intl.formatMessage({ id: 'settings.aboutApp.releaseSize' })}
          </Text>
          <Text>{formatFileSize(updateInfo?.size || 0)}</Text>
        </div>
        <Divider className={styles.divider} />
        <Text strong>
          {intl.formatMessage({ id: 'settings.aboutApp.releaseNotes' })}
        </Text>
        <Paragraph
          style={{
            marginTop: 8,
            maxHeight: 240,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
          }}
        >
          {updateInfo?.notes || '-'}
        </Paragraph>
        {downloading && (
          <div style={{ marginTop: 12 }}>
            <Progress
              percent={progress.total > 0 ? downloadPercent : 100}
              status="active"
              showInfo={progress.total > 0}
            />
            {progress.total > 0 && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {formatFileSize(progress.downloaded)} /{' '}
                {formatFileSize(progress.total)}
              </Text>
            )}
          </div>
        )}
        {localPath && !downloading && (
          <Alert
            type="success"
            showIcon
            style={{ marginTop: 12 }}
            message={intl.formatMessage({
              id: 'settings.aboutApp.downloadComplete',
            })}
          />
        )}
      </Modal>
    </div>
  );
};

export default AboutApp;
