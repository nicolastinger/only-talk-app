import { DEFAULT_ICON } from '@/constants';
import { useIntl } from '@umijs/max';
import { get_black_list, unblock_friend, getFiles } from '@workspace/services';
import { BlackListVo } from '@workspace/types';
import { Button, Card, Empty, Spin, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import styles from '../Settings.less';

const { Title, Text } = Typography;

const BlackList = () => {
  const intl = useIntl();
  const [list, setList] = useState<BlackListVo[]>([]);
  const [avatarMap, setAvatarMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);

  const loadList = async () => {
    setLoading(true);
    try {
      const result = await get_black_list();
      const blackList = result || [];
      setList(blackList);

      const avatarMap = new Map<string, string>();
      for (const item of blackList) {
        if (item.icon) {
          try {
            const files = await getFiles(item.icon);
            if (files?.[0]?.tauri_file_path) {
              avatarMap.set(item.uuid, files[0].tauri_file_path);
            }
          } catch (error) {
            console.log(error);
          }
        }
      }
      setAvatarMap(avatarMap);
    } catch (error) {
      console.error('获取黑名单失败:', error);
      message.error(intl.formatMessage({ id: 'settings.blacklist.loadFailed' }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUnblock = async (uuid: string) => {
    try {
      await unblock_friend(uuid);
      message.success(intl.formatMessage({ id: 'settings.blacklist.unblockSuccess' }));
      loadList();
    } catch (error) {
      console.error('取消拉黑失败:', error);
      message.error(intl.formatMessage({ id: 'settings.blacklist.unblockFailed' }));
    }
  };

  return (
    <div className={styles.settingSection}>
      <Title level={3} className={styles.sectionTitle}>
        {intl.formatMessage({ id: 'settings.blacklist.title' })}
      </Title>

      <Card className={styles.settingCard}>
        <Spin spinning={loading}>
          {list.length === 0 ? (
            <Empty description={intl.formatMessage({ id: 'settings.blacklist.empty' })} />
          ) : (
            list.map((item) => (
              <div key={item.uuid} className={styles.blacklistItem}>
                <img
                  className={styles.blacklistAvatar}
                  src={avatarMap.get(item.uuid) || DEFAULT_ICON}
                  alt="avatar"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = DEFAULT_ICON;
                  }}
                />
                <div className={styles.blacklistIdentity}>
                  <Text className={styles.blacklistName}>{item.username || '-'}</Text>
                  <Text type="secondary" className={styles.blacklistAccount}>
                    {item.account || '-'}
                  </Text>
                </div>
                <Button size="small" onClick={() => handleUnblock(item.uuid)}>
                  {intl.formatMessage({ id: 'settings.blacklist.unblock' })}
                </Button>
              </div>
            ))
          )}
        </Spin>
      </Card>
    </div>
  );
};

export default BlackList;
