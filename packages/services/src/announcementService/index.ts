import {
  HTTP_METHOD,
  TALK_API,
  AnnouncementListResult,
  AnnouncementVO,
  AnnouncementReadUserListResult,
} from "@workspace/types";
import { invoke_rust } from "../httpService";

function parseData<T>(res: any): T {
  if (!res.netSuccess) {
    throw new Error(res.error || "网络请求失败");
  }
  const json = JSON.parse(res.res.body);
  if (json.code === 200) {
    return json.data as T;
  }
  throw new Error(json.message || "请求失败");
}

export const get_announcement_list = async (
  pageNum = 1,
  pageSize = 20
): Promise<AnnouncementListResult> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + "/announcement/list",
    JSON.stringify({ page_num: pageNum, page_size: pageSize, data: {} })
  );
  return parseData<AnnouncementListResult>(res);
};

export const get_announcement_detail = async (
  uuid: string
): Promise<AnnouncementVO> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + `/announcement/detail/${uuid}`,
    ""
  );
  return parseData<AnnouncementVO>(res);
};

export const mark_announcement_read = async (
  uuid: string
): Promise<AnnouncementVO> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + `/announcement/read/${uuid}`,
    ""
  );
  return parseData<AnnouncementVO>(res);
};

export const get_announcement_read_users = async (
  uuid: string,
  pageNum = 1,
  pageSize = 50
): Promise<AnnouncementReadUserListResult> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + `/announcement/read/list/${uuid}`,
    JSON.stringify({ page_num: pageNum, page_size: pageSize, data: {} })
  );
  return parseData<AnnouncementReadUserListResult>(res);
};
