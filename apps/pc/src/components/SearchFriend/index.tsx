import { add_friend, search_user_by_account, getFiles } from '@workspace/services';
import { FriendRequestInfoDTO } from '@workspace/types';
import { FormattedMessage, useIntl } from '@umijs/max';
import { Avatar, Button, Form, Input, List, message, Modal } from 'antd';
import { useState, useEffect } from 'react';
import styles from './index.less';
import { UserInfo } from '@workspace/types';
import { invoke } from '@tauri-apps/api/core';

const SearchFriend = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<UserInfo[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [currentUser, setCurrentUser] = useState<{
    userId: string;
    username: string;
  } | null>(null);
  const [requestMessage, setRequestMessage] = useState('');
  const [avatarUrls, setAvatarUrls] = useState<{[key: string]: string}>({});
  const intl = useIntl();

  const handleSearch = async (values: { searchKey: string }) => {
    setLoading(true);
    try {
      let result = await search_user_by_account(values.searchKey);
      console.log(result);
      if (result.netSuccess && result.res.status === 200) {
        const data = JSON.parse(result.res.body);
        const users: UserInfo = data.data;
        setResults([users]);
      }
    } catch (error) {
      message.error('搜索用户时出现错误');
    }
    setLoading(false);
  };

  const showModal = (userId: string, username: string) => {
    setCurrentUser({ userId, username });
    setRequestMessage(`我是`);
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
        message.success(`已发送好友请求给 ${currentUser.username}`);
        handleCancel();
      } else {
        message.error('发送好友请求失败');
      }
    } catch (error) {
      message.error('发送好友请求时出现错误');
    }
  };

  const handleClear = () => {
    form.resetFields();
    setResults([]);
  };

  // 获取用户头像
  const getUserIcon = async (icon: string): Promise<string> => {
    try {
      const FileVos = await getFiles(icon);

      return FileVos?.[0]?.tauri_file_path || '';
    } catch (error) {
      message.error('获取用户头像时出现错误');

      console.log(error);
      return '';
    }
  };

  // 当results更新时，预加载所有用户的头像
  useEffect(() => {
    const loadAvatars = async () => {
      const newAvatarUrls: {[key: string]: string} = {};
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
                    添加好友
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  avatar={
                    <Avatar src={avatarUrls[item.uuid || '']}>{item.username}</Avatar>
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
        title="添加好友申请"
        open={isModalVisible}
        onOk={handleAddFriend}
        onCancel={handleCancel}
        okText="发送申请"
        cancelText="取消"
      >
        {currentUser && (
          <div style={{ marginBottom: 16 }}>
            <p>
              发送好友申请给: <strong>{currentUser.username}</strong>
            </p>
          </div>
        )}
        <Form.Item label="申请说明" required>
          <Input.TextArea
            value={requestMessage}
            onChange={(e) => setRequestMessage(e.target.value)}
            rows={4}
            placeholder="请输入好友申请说明"
          />
        </Form.Item>
      </Modal>
    </div>
  );
};

export default SearchFriend;