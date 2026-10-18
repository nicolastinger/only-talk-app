import UserTypeTag from '@/components/UserTypeTag';
import { DEFAULT_ICON } from '@/constants';
import { useBearStore } from '@/store/store';
import { calcAgeFromBirthday } from '@/utils/format';
import { LockOutlined, StopOutlined, UserOutlined } from '@ant-design/icons';
import { history, useIntl } from '@umijs/max';
import { getFiles } from '@workspace/services';
import { Button, Card, Checkbox, Divider, Typography } from 'antd';
import { useEffect, useState } from 'react';
import styles from '../Settings.less';
import ChangePasswordModal from './ChangePasswordModal';

const { Title, Text } = Typography;

const AccountPrivacy = () => {
  const intl = useIntl();
  const userInfo = useBearStore((state) => state.userInfo);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [changePwdOpen, setChangePwdOpen] = useState(false);

  useEffect(() => {
    const loadAvatar = async (icon: string) => {
      try {
        if (!icon) {
          setAvatarUrl('');
          return;
        }
        const FileVos = await getFiles(icon);
        setAvatarUrl(FileVos?.[0]?.tauri_file_path || '');
      } catch (error) {
        console.log(error);
        setAvatarUrl('');
      }
    };
    loadAvatar(userInfo?.icon || '');
  }, [userInfo?.icon]);

  const formatBirthday = (timestamp?: number) => {
    if (!timestamp) return '-';
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('zh-CN');
  };

  const genderLabel = (gender?: number) => {
    if (gender === 2)
      return intl.formatMessage({ id: 'settings.accountPrivacy.male' });
    if (gender === 3)
      return intl.formatMessage({ id: 'settings.accountPrivacy.female' });
    return '-';
  };

  return (
    <div className={styles.settingSection}>
      <Title level={3} className={styles.sectionTitle}>
        {intl.formatMessage({ id: 'settings.accountPrivacy.title' })}
      </Title>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <UserOutlined className={styles.cardIcon} />
          <Text strong>
            {intl.formatMessage({ id: 'settings.accountPrivacy.accountInfo' })}
          </Text>
        </div>
        <Divider className={styles.divider} />
        <div className={styles.profileHeader}>
          <img
            className={styles.profileAvatar}
            src={avatarUrl || DEFAULT_ICON}
            alt="avatar"
            onError={(e) => {
              (e.target as HTMLImageElement).src = DEFAULT_ICON;
            }}
          />
          <div className={styles.profileIdentity}>
            <div className={styles.profileName}>
              {userInfo?.username || '-'}
              <UserTypeTag type={userInfo?.user_type} />
            </div>
            <div className={styles.profileAccount}>
              {userInfo?.account || '-'}
            </div>
          </div>
        </div>
        <div className={styles.accountInfo}>
          <span className={styles.accountLabel}>
            {intl.formatMessage({ id: 'settings.accountPrivacy.phoneNumber' })}
          </span>
          <span className={styles.accountValue}>
            {userInfo?.phone
              ? `${userInfo.phone.slice(0, 3)}****${userInfo.phone.slice(-4)}`
              : '-'}
          </span>
        </div>
        <div className={styles.accountInfo}>
          <span className={styles.accountLabel}>
            {intl.formatMessage({ id: 'settings.accountPrivacy.email' })}
          </span>
          <span className={styles.accountValue}>{userInfo?.email || '-'}</span>
        </div>
        <div className={styles.accountInfo}>
          <span className={styles.accountLabel}>
            {intl.formatMessage({ id: 'settings.accountPrivacy.bio' })}
          </span>
          <span className={styles.accountValue}>{userInfo?.info || '-'}</span>
        </div>
        <div className={styles.accountInfo}>
          <span className={styles.accountLabel}>
            {intl.formatMessage({ id: 'settings.accountPrivacy.gender' })}
          </span>
          <span className={styles.accountValue}>
            {genderLabel(userInfo?.gender)}
          </span>
        </div>
        <div className={styles.accountInfo}>
          <span className={styles.accountLabel}>
            {intl.formatMessage({ id: 'settings.accountPrivacy.age' })}
          </span>
          <span className={styles.accountValue}>
            {calcAgeFromBirthday(userInfo?.birthday) ?? '-'}
          </span>
        </div>
        <div className={styles.accountInfo}>
          <span className={styles.accountLabel}>
            {intl.formatMessage({ id: 'settings.accountPrivacy.birthday' })}
          </span>
          <span className={styles.accountValue}>
            {formatBirthday(userInfo?.birthday)}
          </span>
        </div>
      </Card>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <UserOutlined className={styles.cardIcon} />
          <Text strong>
            {intl.formatMessage({
              id: 'settings.accountPrivacy.privacySettings',
            })}
          </Text>
        </div>
        <Divider className={styles.divider} />
        <Checkbox defaultChecked className={styles.settingCheckbox}>
          {intl.formatMessage({
            id: 'settings.accountPrivacy.allowSearchByPhone',
          })}
        </Checkbox>
        <Checkbox defaultChecked className={styles.settingCheckbox}>
          {intl.formatMessage({ id: 'settings.accountPrivacy.allowRecommend' })}
        </Checkbox>
        <Text type="secondary" className={styles.description}>
          {intl.formatMessage({ id: 'settings.accountPrivacy.privacyDesc' })}
        </Text>
      </Card>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <StopOutlined className={styles.cardIcon} />
          <Text strong>
            {intl.formatMessage({ id: 'settings.accountPrivacy.blacklist' })}
          </Text>
        </div>
        <Divider className={styles.divider} />
        <Button onClick={() => history.push('/home/settings?tab=blacklist')}>
          {intl.formatMessage({
            id: 'settings.accountPrivacy.manageBlacklist',
          })}
        </Button>
        <Text type="secondary" className={styles.description}>
          {intl.formatMessage({ id: 'settings.accountPrivacy.blacklistDesc' })}
        </Text>
      </Card>

      <Card className={styles.settingCard}>
        <div className={styles.cardHeader}>
          <LockOutlined className={styles.cardIcon} />
          <Text strong>
            {intl.formatMessage({
              id: 'settings.accountPrivacy.securitySettings',
            })}
          </Text>
        </div>
        <Divider className={styles.divider} />
        <Button type="primary" onClick={() => setChangePwdOpen(true)}>
          {intl.formatMessage({ id: 'settings.accountPrivacy.changePassword' })}
        </Button>
        <Text type="secondary" className={styles.description}>
          {intl.formatMessage({ id: 'settings.accountPrivacy.securityDesc' })}
        </Text>
      </Card>

      <ChangePasswordModal
        open={changePwdOpen}
        onClose={() => setChangePwdOpen(false)}
        onGoBind={() => history.push('/home/settings?tab=authFactor')}
      />
    </div>
  );
};

export default AccountPrivacy;
