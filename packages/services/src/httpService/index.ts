import { RustResponse, HttpStatusMap, TALK_API } from "@workspace/types";
import { invoke } from "@tauri-apps/api/core";

export interface NotificationService {
  error: (options: {
    key: string;
    message: string;
    description: string;
    duration: number | null;
  }) => void;
}

let notificationService: NotificationService | null = null;

export const setNotificationService = (service: NotificationService) => {
  notificationService = service;
};

const base_url: string = TALK_API;

export const invoke_rust = async (
  method: string,
  url: string,
  body: string
): Promise<RustResponse> => {
  if (!url.includes(base_url)) {
    url = base_url + url;
  }
  let res: RustResponse = {
    netSuccess: false,
    error: "",
    res: {
      status: 500,
      body: "",
    },
  };
  try {
    if (method === "get_request") {
      res.res = await invoke(method, { url });
    } else {
      res.res = await invoke(method, { url, body });
    }
    res.netSuccess = true;
    if (res.res.status !== 200 && res.res.status !== 204) {
      res.error = HttpStatusMap.get(res.res.status);
    }
  } catch (e) {
    console.log("网络请求失败", e);
    res.error = JSON.stringify(e);
    if (notificationService) {
      notificationService.error({
        key: "request_status",
        message: "请求失败,请检查网络",
        description: `错误信息: ${res.error || "未知错误"}`,
        duration: null,
      });
    }
  }
  return res;
};
