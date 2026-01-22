import { RustResponse } from '@/types/backend/httpRust';
import { invoke } from '@tauri-apps/api/core';
import { notification } from 'antd'; // 导入通知组件
import { HttpStatusMap, TALK_API } from '@/constants';

const base_url: string = TALK_API

const invoke_rust = async (
  method: string,
  url: string,
  body: string,
): Promise<RustResponse> => {
  if (!url.includes(base_url)) {
    url = base_url + url
  }
  let res: RustResponse = {
    netSuccess: false,
    error: '',
    res: {
      status: 500,
      body: '',
    },
  };
  try {
    res.res = await invoke(method, {
      url,
      body,
    });
    // 网络请求成功，业务不一定成功
    res.netSuccess = true;
    if (res.res.status !== 200 && res.res.status !== 204) {
      res.error = HttpStatusMap.get(res.res.status);
    }
  } catch (e) {
    console.log('网络请求失败', e);
    res.error = JSON.stringify(e);
    // 错误通知
    notification.error({
      key: 'request_status',
      message: '请求失败,请检查网络',
      description: `错误信息: ${res.error || '未知错误'}`,
      duration: null, // 不自动关闭，需手动点击
    });
  }
  return res;
};

export { invoke_rust };
