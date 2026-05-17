import { DEFAULT_ICON } from '@/constants';
import { invoke } from '@tauri-apps/api/core';
import { FormattedMessage, useIntl } from '@umijs/max';
import {
  add_friend,
  cache_user_info,
  getFiles,
  search_user_by_account,
} from '@workspace/services';
import { FriendRequestInfoDTO, UserInfo } from '@workspace/types';
import { Avatar, Button, Form, Input, List, message, Modal } from 'antd';
import { useEffect, useState } from 'react';
import styles from './index.less';

const SearchFriend = () => {
  const [form] = Form.useForm();
  const intl = useIntl();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<UserInfo[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [currentUser, setCurrentUser] = useState<{
    userId: string;
    username: string;
  } | null>(null);
  const [requestMessage, setRequestMessage] = useState('');
  const [avatarUrls, setAvatarUrls] = useState<{ [key: string]: string }>({});

  const handleSearch = async (values: { searchKey: string }) => {
    setLoading(true);
    try {
      let result = await search_user_by_account(values.searchKey);
      console.log(result);
      if (result.netSuccess && result.res.status === 200) {
        const data = JSON.parse(result.res.body);
        const users: UserInfo = data.data;
        setResults([users]);
        cache_user_info(users).catch((err) => {
          console.error('缓存用户信息失败:', err);
        });
      }
    } catch (error) {
      message.error(intl.formatMessage({ id: 'friendRequest.searchError' }));
    }
    setLoading(false);
  };

  const showModal = (userId: string, username: string) => {
    setCurrentUser({ userId, username });
    setRequestMessage('');
    setIsModalVisible(true);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
    setCurrentUser(null);
    setRequestMessage('');
  };

  const handleAddFriend = async () => {
    if (!currentUser) return;

    try {
      let me = (await invoke('get_user_map', { key: 'uuid' })) as string;

      const friendData: FriendRequestInfoDTO = {
        request_message: requestMessage,
        accept_message: '',
        request_user: me,
        accept_user: currentUser.userId,
        add_type: 'search',
        version: 0,
        accept_status: 0,
      };

      const result = await add_friend(friendData);
      console.log('请求结果', result);
      if (result.netSuccess && result.res.status === 200) {
        message.success(
          intl.formatMessage(
            { id: 'friendRequest.requestSent' },
            { username: currentUser.username },
          ),
        );
        handleCancel();
      } else {
        message.error(intl.formatMessage({ id: 'friendRequest.sendFailed' }));
      }
    } catch (error) {
      message.error(intl.formatMessage({ id: 'friendRequest.sendError' }));
    }
  };

  const handleClear = () => {
    form.resetFields();
    setResults([]);
  };

  const getUserIcon = async (icon: string): Promise<string> => {
    try {
      const FileVos = await getFiles(icon);

      return FileVos?.[0]?.tauri_file_path || '';
    } catch (error) {
      message.error(intl.formatMessage({ id: 'friendRequest.avatarError' }));

      console.log(error);
      return '';
    }
  };

  useEffect(() => {
    const loadAvatars = async () => {
      const newAvatarUrls: { [key: string]: string } = {};
      for (const item of results) {
        if (item.icon && item.uuid) {
          newAvatarUrls[item.uuid] = await getUserIcon(item.icon);
        }
      }
      setAvatarUrls(newAvatarUrls);
    };

    if (results.length > 0) {
      loadAvatars();
    }
  }, [results]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.title}>
          <FormattedMessage id="searchFriend.title" />
        </div>
      </div>
      <div className={styles.content}>
        <Form form={form} onFinish={handleSearch}>
          <Form.Item
            name="searchKey"
            rules={[
              {
                required: true,
                message: intl.formatMessage({ id: 'searchFriend.placeholder' }),
              },
            ]}
          >
            <Input
              placeholder={intl.formatMessage({
                id: 'searchFriend.placeholder',
              })}
              allowClear
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading}>
              <FormattedMessage id="searchFriend.submit" />
            </Button>
            <Button onClick={handleClear} style={{ marginLeft: 8 }}>
              <FormattedMessage id="searchFriend.clear" />
            </Button>
          </Form.Item>
        </Form>

        {results.length > 0 ? (
          <List
            dataSource={results}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Button
                    type="primary"
                    onClick={() =>
                      showModal(item.uuid || '', item.username || '')
                    }
                  >
                    <FormattedMessage id="friendRequest.addFriend" />
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  avatar={
                    <Avatar src={avatarUrls[item.uuid || ''] || DEFAULT_ICON}>
                      {item.username}
                    </Avatar>
                  }
                  title={item.username}
                  description={item.info}
                />
              </List.Item>
            )}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <FormattedMessage id="searchFriend.noData" />
          </div>
        )}
      </div>
      <div className={styles.footer}></div>

      <Modal
        title={intl.formatMessage({ id: 'friendRequest.addFriendRequest' })}
        open={isModalVisible}
        onOk={handleAddFriend}
        onCancel={handleCancel}
        okText={intl.formatMessage({ id: 'friendRequest.sendRequest' })}
        cancelText={intl.formatMessage({ id: 'friendRequest.cancel' })}
      >
        {currentUser && (
          <div style={{ marginBottom: 16 }}>
            <p>
              {intl.formatMessage({ id: 'friendRequest.sendTo' })}:{' '}
              <strong>{currentUser.username}</strong>
            </p>
          </div>
        )}
        <Form.Item
          label={intl.formatMessage({ id: 'friendRequest.requestMessage' })}
          required
        >
          <Input.TextArea
            value={requestMessage}
            onChange={(e) => setRequestMessage(e.target.value)}
            rows={4}
            placeholder={intl.formatMessage({
              id: 'friendRequest.requestPlaceholder',
            })}
          />
        </Form.Item>
      </Modal>
    </div>
  );
};

export default SearchFriend;
