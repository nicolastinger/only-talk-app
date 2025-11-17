import { VideoConfig } from '@/types/p2p';
import { RequestMediaMsg, UserInfo } from '@/types/user/common';
import { UnreadCount } from '@/types/menu';
import { create } from 'zustand';

interface BearState {
  bears: number;
  increase: (by: number) => void;
  userIcon: string;
  setUserIcon: (userIcon: string) => void;
  userInfo: UserInfo;
  setUserInfo: (userInfo: UserInfo) => void;
  requestMediaMsg: RequestMediaMsg; //通讯请求
  setRequestMediaMsg: (requestMediaMsg: RequestMediaMsg) => void;
  videoConfig: VideoConfig;
  setVideoConfig: (videoConfig: VideoConfig) => void;
  menuUnread: UnreadCount;
  setMenuUnread: (menuUnread: UnreadCount) => void;
  isLogin: boolean;
  setIsLogin: (isLogin: boolean) => void;
}

export const useBearStore = create<BearState>()((set) => ({
  bears: 0,
  userIcon:
    'https://ss1.bdstatic.com/70cFvXSh_Q1YnxGkpoWK1HF6hhy/it/u=3663778712,1545220977&fm=253&gp=0.jpg',
  userInfo: {},
  setUserInfo: (userInfo: UserInfo) => set({ userInfo: userInfo }),
  setUserIcon: (userIcon: string) => set({ userIcon: userIcon }),
  increase: (by) => set((state) => ({ bears: state.bears + by })),
  requestMediaMsg: {
    mediaType: 0,
    p2pInitMsg: {
      accept_addr: '',
      request_addr: '',
      request_uuid: '',
      request_token: '',
      accept: false,
      ip_type: 0,
    },
  },
  videoConfig: {
    width: 1280,
    height: 720,
    fps: 30,
    audio: false,
    video: true,
    encode: 'video/webm;codecs=vp8',
    bitrate: 1000000,
  },
  setVideoConfig: (videoConfig: VideoConfig) =>
    set({ videoConfig: videoConfig }),
  setRequestMediaMsg: (requestMediaMsg: RequestMediaMsg) =>
    set({ requestMediaMsg: requestMediaMsg }),
  menuUnread: {
    chats: 0,
    contacts: 0,
    groups: 0,
    system: 0,
    settings: 0,
  },
  isLogin: false,
  setIsLogin: (isLogin: boolean) => set({ isLogin: isLogin }),
  setMenuUnread: (menuUnread: UnreadCount) =>
    set({ menuUnread: menuUnread }),
}));
