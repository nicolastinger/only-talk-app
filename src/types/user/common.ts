import React from 'react';

interface LayoutBtnProps {
  text: string;
  url: string;
  icon?: React.ReactNode;
  active: boolean;
}

interface MessageQueueProps {
  message: string;
  img: string;
  time: number;
  title: string;
  count: number;
}

interface FriendQueueProps {
  account: string;
  img: string;
  title: string;
}

interface ChatMessage {
  from: MessageFrom;
  ack: boolean | undefined;
  img?: string;
  text_msg_raw: TextMsgRaw;
}

export enum MessageFrom {
  System = 0,
  Mine = 1,
  Friend = 2,
  Customer = 3,
  Other = 4,
}

interface FriendInfo {
  uuid: string;
  account: string;
  username: string;
  icon: string;
  info: string;
}

interface BasicUser {
  uuid?: string;
  username?: string;
  account?: string;
  icon?: string;
  password?: string;
}

interface UserInfo {
  uuid?: string;
  username?: string;
  account?: string;
  icon?: string;
  gender?: number;
  age?: number;
  birthday?: number;
  info?: string;
  create_at?: number;
  update_at?: number;
  last_login_at?: number;
  last_login_equipment?: string;
  last_login_ipv4?: string;
  last_login_ipv6?: string;
  phone?: string;
  email?: string;
  address?: string;
  status?: number;
}

interface P2pMsg {
  type: number; //指定处理逻辑
  raw: string; //json序列化对象
}

interface TextMsgRaw {
  nano_id: string;
  text_type: number; //消息类型
  raw: string;
  recv_user: string; //接收用户
  send_user: string; //发送用户
  timestamp: number;
}

interface P2pInitMsg {
  accept_addr: string;
  // 请求人地址
  request_addr: string;
  // 请求人uuid
  request_uuid: string;
  // 请求人token
  request_token: string;
  // 是否接受
  accept: boolean;
  // ip类型-v4或者v6
  ip_type: number;
}

interface RequestMediaMsg {
  mediaType: number; //通讯请求,1-视频通话邀请，2-语音通话邀请, 3-群视频，4-群语音
  p2pInitMsg: P2pInitMsg;
}

export type {
  ChatMessage,
  FriendInfo,
  FriendQueueProps,
  LayoutBtnProps,
  MessageQueueProps,
  P2pInitMsg,
  P2pMsg,
  RequestMediaMsg,
  TextMsgRaw,
  UserInfo,
  BasicUser
};
