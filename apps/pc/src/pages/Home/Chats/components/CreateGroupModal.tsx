import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { CreateGroupRequest, FriendVo, GroupVo } from '@workspace/types';
import { Modal, Input, Select, message } from 'antd';
import React from 'react';

interface CreateGroupModalProps {
  visible: boolean;
  onCancel: () => void;
  onSuccess: (groupId?: string) => void;
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
      const friends: FriendVo[] = await invoke('get_friend_list');
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
      const request: CreateGroupRequest = {
        group_name: groupName.trim(),
        group_icon: '',
        member_ids: selectedFriends,
      };
      const group: GroupVo = await invoke('create_group_command', { request });
      message.success('群聊创建成功');
      onSuccess(group.group_id);
    } catch (err) {
      console.log('创建群聊失败', err);
      message.error('创建群聊失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="创建群聊"
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
