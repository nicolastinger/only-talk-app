import React from "react";
import { TextQuicMsgVo } from "../backend";

interface LayoutBtnProps {
  text: string;
  url: string;
  icon?: React.ReactNode;
  active: boolean;
  unreadCount: number;
}

interface MessageQueueProps {
  message: string;
  img: string;
  time: number;
  title: string;
  count: number;
  text_type?: number;
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
  text_msg_raw: TextQuicMsgVo;
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
  uuid: string;
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
  type: number;
  raw: string;
}

interface P2pInitMsg {
  accept_addr: string;
  request_addr: string;
  request_uuid: string;
  request_token: string;
  accept: boolean;
  ip_type: number;
}

interface RequestMediaMsg {
  mediaType: number;
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
  UserInfo,
  BasicUser,
};
