import { useState, useEffect } from 'react';
import { FriendVo, GroupVo } from '@workspace/types';
import {
  get_friend_list,
  create_group,
  invite_group_members,
  create_group_chat_session,
} from '@workspace/services';
import { Modal, Input, Select, message } from 'antd';
import { history } from '@umijs/max';

interface CreateGroupModalProps {
  visible: boolean;
  onCancel: () => void;
  onSuccess?: (groupId?: string) => void;
}

const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  visible,
  onCancel,
  onSuccess,
}) => {
  const [groupName, setGroupName] = useState('');
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [friendList, setFriendList] = useState<FriendVo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      loadFriends();
      setGroupName('');
      setSelectedFriends([]);
    }
  }, [visible]);

  const loadFriends = async () => {
    try {
      const friends = await get_friend_list();
      setFriendList(friends);
    } catch (err) {
      console.log('获取好友列表失败', err);
    }
  };

  const handleCreate = async () => {
    if (!groupName.trim()) {
      message.warning('请输入群名称');
      return;
    }
    setLoading(true);
    try {
      const group: GroupVo = await create_group({
        group_name: groupName.trim(),
      });
      if (selectedFriends.length > 0) {
        await invite_group_members(group.group_uuid, selectedFriends);
      }
      await create_group_chat_session(group.group_uuid);
      message.success('群聊创建成功');
      onSuccess?.(group.group_uuid);
      onCancel();
      history.push('/home/chats/group-chat?groupId=' + group.group_uuid);
    } catch (err) {
      console.log('创建群聊失败', err);
      message.error('创建群聊失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="发起群会话"
      open={visible}
      onOk={handleCreate}
      onCancel={onCancel}
      confirmLoading={loading}
      okText="创建"
      cancelText="取消"
    >
      <div style={{ marginBottom: 16 }}>
        <label>群名称</label>
        <Input
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="输入群聊名称"
          style={{ marginTop: 8 }}
        />
      </div>
      <div>
        <label>选择成员</label>
        <Select
          mode="multiple"
          style={{ width: '100%', marginTop: 8 }}
          placeholder="选择好友"
          value={selectedFriends}
          onChange={setSelectedFriends}
          options={friendList.map((f) => ({
            label: f.friend_name,
            value: f.friend_id,
          }))}
        />
      </div>
    </Modal>
  );
};

export default CreateGroupModal;
