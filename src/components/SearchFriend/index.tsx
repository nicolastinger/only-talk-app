import { add_friend, search_user_by_account } from '@/services/userService';
import { FriendRequestInfoDTO } from '@/types/friend';
import { FormattedMessage, useIntl } from '@umijs/max';
import { Avatar, Button, Form, Input, List, message } from 'antd';
import { useState } from 'react';
import styles from './index.less';
import { UserInfo } from '@/types/user/common';

const SearchFriend = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<UserInfo[]>([]);
  const intl = useIntl();

  const handleSearch = async (values: { searchKey: string }) => {
    setLoading(true);
    try {
      let result = await search_user_by_account(values.searchKey);
      console.log(result);
      if (result.isSuccess && result.res.status === 200){
        const data = JSON.parse(result.res.body);
        const users: UserInfo = data.data
        setResults([users]);
      }
    } catch (error) {
      message.error('搜索用户时出现错误');
    }
    setLoading(false);
  };

  const handleAddFriend = async (userId: string, username: string) => {
    const friendData: FriendRequestInfoDTO = {
      request_message: '我是' + username,
      accept_message: '',
      request_user: userId,
      accept_user: '',
      add_type: 'search',
      version: 0,
      accept_status: 0,
    };

    try {
      const result = await add_friend(friendData);
      if (result.isSuccess) {
        message.success(`已发送好友请求给 ${username}`);
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
                    onClick={() => handleAddFriend(item.uuid || "", item.username || "")}
                  >
                    添加好友
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  avatar={<Avatar src={item.icon}>{item.username}</Avatar>}
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
    </div>
  );
};

export default SearchFriend;
