import { reactive } from 'vue';
import type {
  RequestMediaMsg,
  UnreadCount,
  UserInfo,
  VideoConfig,
} from '@workspace/types';

interface BearState {
  bears: number;
  increase: (by: number) => void;
  userIcon: string;
  setUserIcon: (userIcon: string) => void;
  userInfo: UserInfo;
  setUserInfo: (userInfo: UserInfo) => void;
  requestMediaMsg: RequestMediaMsg;
  setRequestMediaMsg: (requestMediaMsg: RequestMediaMsg) => void;
  videoConfig: VideoConfig;
  setVideoConfig: (videoConfig: VideoConfig) => void;
  menuUnread: UnreadCount;
  setMenuUnread: (menuUnread: UnreadCount) => void;
  isLogin: boolean;
  setIsLogin: (isLogin: boolean) => void;
  setAddContacts: (addContacts: number) => void;
  setAddGroups: (addGroups: number) => void;
  setAddSystem: (addSystem: number) => void;
  setAddSettings: (addSettings: number) => void;
  chats: number;
  setChats: (chats: number, isAdd: boolean) => void;
  refreshFlag: number;
  triggerRefresh: () => void;
  isSyncing: boolean;
  setIsSyncing: (isSyncing: boolean) => void;
  /** 当前用户资料弹窗可见性（点击自己的头像时打开） */
  userInfoModalVisible: boolean;
  openUserInfoModal: () => void;
  closeUserInfoModal: () => void;
}

/**
 * 全局应用状态。
 *
 * 与 React 版 zustand store 的字段/方法保持一致，但改为 Vue reactive 单例，
 * 与移动端的 stores 写法对齐。
 */
const state = reactive<BearState>({
  bears: 0,
  userIcon:
    'https://ss1.bdstatic.com/70cFvXSh_Q1YnxGkpoWK1HF6hhy/it/u=3663778712,1545220977&fm=253&gp=0.jpg',
  userInfo: {
    uuid: '',
  },
  setUserInfo: (userInfo: UserInfo) => {
    state.userInfo = userInfo;
  },
  setUserIcon: (userIcon: string) => {
    state.userIcon = userIcon;
  },
  increase: (by) => {
    state.bears += by;
  },
  requestMediaMsg: {
    mediaType: 0,
    p2pInitMsg: {
      accept_addr: '',
      request_addr: '',
      request_uuid: '',
      request_token: '',
      accept_uuid: '',
      accept: false,
      ip_type: 0,
      step: 0,
      is_server: false,
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
  setVideoConfig: (videoConfig: VideoConfig) => {
    state.videoConfig = videoConfig;
  },
  setRequestMediaMsg: (requestMediaMsg: RequestMediaMsg) => {
    state.requestMediaMsg = requestMediaMsg;
  },
  menuUnread: {
    contacts: 0,
    groups: 0,
    plaza: 0,
    moments: 0,
    system: 0,
    settings: 0,
    total: 0,
  },
  isLogin: false,
  setIsLogin: (isLogin: boolean) => {
    state.isLogin = isLogin;
  },
  setMenuUnread: (menuUnread: UnreadCount) => {
    state.menuUnread = menuUnread;
  },
  setAddContacts: (addContacts: number) => {
    state.menuUnread.contacts = Math.max(
      0,
      state.menuUnread.contacts + addContacts,
    );
  },
  chats: 0,
  setChats: (chats: number, isAdd: boolean) => {
    if (isAdd) {
      state.chats = Math.max(0, state.chats + chats);
    } else {
      state.chats = Math.max(0, chats);
    }
  },
  setAddGroups: (addGroups: number) => {
    state.menuUnread.groups = Math.max(0, state.menuUnread.groups + addGroups);
  },
  setAddSystem: (addSystem: number) => {
    state.menuUnread.system = Math.max(0, state.menuUnread.system + addSystem);
  },
  setAddSettings: (addSettings: number) => {
    state.menuUnread.settings = Math.max(
      0,
      state.menuUnread.settings + addSettings,
    );
  },
  refreshFlag: 0,
  triggerRefresh: () => {
    state.refreshFlag += 1;
  },
  isSyncing: false,
  setIsSyncing: (isSyncing: boolean) => {
    state.isSyncing = isSyncing;
  },
  userInfoModalVisible: false,
  openUserInfoModal: () => {
    state.userInfoModalVisible = true;
  },
  closeUserInfoModal: () => {
    state.userInfoModalVisible = false;
  },
});

/** 兼容 React 版的 useBearStore() 调用方式，返回同一个 reactive 单例 */
export const useBearStore = () => state;

/** 供非组件代码直接访问（对应 React 版 useBearStore.getState()） */
export const bearStore = state;
