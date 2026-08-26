import { DEFAULT_ICON } from '@/constants';
import { useIntl } from '@umijs/max';
import {
  block_friend,
  get_black_list,
  getFiles,
  search_user_by_account,
  unblock_friend,
} from '@workspace/services';
import { BlackListVo, UserInfo } from '@workspace/types';
import { Button, Card, Empty, Input, Modal, Spin, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import styles from '../Settings.less';

const { Title, Text } = Typography;

const BlackList = () => {
  const intl = useIntl();
  const [list, setList] = useState<BlackListVo[]>([]);
  const [avatarMap, setAvatarMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);

  const [searchKey, setSearchKey] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<UserInfo | null>(null);
  const [searchAvatar, setSearchAvatar] = useState('');
  const [blockConfirmVisible, setBlockConfirmVisible] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);

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

  const getUserIcon = async (icon: string): Promise<string> => {
    try {
      const files = await getFiles(icon);
      return files?.[0]?.tauri_file_path || '';
    } catch (error) {
      console.error('获取头像失败:', error);
      return '';
    }
  };

  const handleSearch = async () => {
    if (!searchKey.trim()) return;
    setSearching(true);
    try {
      const result = await search_user_by_account(searchKey.trim());
      if (result.netSuccess && result.res.status === 200) {
        const data = JSON.parse(result.res.body);
        const user: UserInfo = data.data;
        if (user?.uuid) {
          setSearchResult(user);
          setSearchAvatar(await getUserIcon(user.icon || ''));
        } else {
          setSearchResult(null);
          message.info(intl.formatMessage({ id: 'settings.blacklist.notFound' }));
        }
      } else {
        message.error(intl.formatMessage({ id: 'settings.blacklist.notFound' }));
      }
    } catch (error) {
      console.error('搜索用户失败:', error);
      message.error(intl.formatMessage({ id: 'settings.blacklist.notFound' }));
    } finally {
      setSearching(false);
    }
  };

  const handleBlock = async () => {
    if (!searchResult?.uuid) return;
    setBlockLoading(true);
    try {
      await block_friend(searchResult.uuid);
      message.success(intl.formatMessage({ id: 'settings.blacklist.blockSuccess' }));
      setBlockConfirmVisible(false);
      setSearchResult(null);
      setSearchKey('');
      setSearchAvatar('');
      loadList();
    } catch (error) {
      console.error('拉黑失败:', error);
      message.error(intl.formatMessage({ id: 'settings.blacklist.blockFailed' }));
    } finally {
      setBlockLoading(false);
    }
  };

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

  const cancelText = intl.formatMessage({ id: 'settings.blacklist.cancel' });
  const blockText = intl.formatMessage({ id: 'settings.blacklist.block' });

  return (
    <div className={styles.settingSection}>
      <Title level={3} className={styles.sectionTitle}>
        {intl.formatMessage({ id: 'settings.blacklist.title' })}
      </Title>

      <Card className={styles.settingCard}>
        <div className={styles.blacklistSearch}>
          <Input
            placeholder={intl.formatMessage({
              id: 'settings.blacklist.searchPlaceholder',
            })}
            value={searchKey}
            allowClear
            onChange={(e) => setSearchKey(e.target.value)}
            onPressEnter={handleSearch}
            suffix={
              <Button type="primary" size="small" loading={searching} onClick={handleSearch}>
                {intl.formatMessage({ id: 'settings.blacklist.search' })}
              </Button>
            }
          />
        </div>

        {searchResult && (
          <div className={styles.blacklistItem}>
            <img
              className={styles.blacklistAvatar}
              src={searchAvatar || DEFAULT_ICON}
              alt="avatar"
              onError={(e) => {
                (e.target as HTMLImageElement).src = DEFAULT_ICON;
              }}
            />
            <div className={styles.blacklistIdentity}>
              <Text className={styles.blacklistName}>{searchResult.username || '-'}</Text>
              <Text type="secondary" className={styles.blacklistAccount}>
                {searchResult.account || '-'}
              </Text>
            </div>
            <Button size="small" danger onClick={() => setBlockConfirmVisible(true)}>
              {blockText}
            </Button>
          </div>
        )}

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

      <Modal
        title={intl.formatMessage({ id: 'settings.blacklist.blockConfirmTitle' })}
        open={blockConfirmVisible}
        onOk={handleBlock}
        onCancel={() => setBlockConfirmVisible(false)}
        okText={blockText}
        cancelText={cancelText}
        okButtonProps={{ danger: true, loading: blockLoading }}
      >
        {searchResult && (
          <p>
            {intl.formatMessage(
              { id: 'settings.blacklist.blockConfirmMsg' },
              { name: searchResult.username || searchResult.account },
            )}
          </p>
        )}
      </Modal>
    </div>
  );
};

export default BlackList;
