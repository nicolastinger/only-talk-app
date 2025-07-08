import { RustResponse } from '@/types/backend/httpRust';
import { invoke } from '@tauri-apps/api/core';
import { notification } from 'antd'; // 导入通知组件

const invoke_rust = async(method: string, url: string, body: string): Promise<RustResponse> =>{
  let res: RustResponse = {
    isSuccess: false,
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
    res.isSuccess = true
  } catch (e) {
    console.log('网络请求失败', e);
    res.error = JSON.stringify(e);
    // 错误通知
    notification.error({
      key: 'request_status',
      message: '请求失败',
      description: `错误信息: ${res.error || '未知错误'}`,
      duration: null, // 不自动关闭，需手动点击
    });
  }
  return res;
}

export { invoke_rust }