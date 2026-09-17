import {
  HTTP_METHOD,
  AnnouncementListResult,
  AnnouncementVO,
  AnnouncementReadUserListResult,
  RustResponse,
} from "@workspace/types";
import { getApiBase, invoke_rust, parseBackendResponse } from "../httpService";

function parseData<T>(res: RustResponse): T {
  return parseBackendResponse<T>(res);
}

export const get_announcement_list = async (
  pageNum = 1,
  pageSize = 20
): Promise<AnnouncementListResult> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    getApiBase() + "/announcement/list",
    JSON.stringify({ page_num: pageNum, page_size: pageSize, data: {} })
  );
  return parseData<AnnouncementListResult>(res);
};

export const get_announcement_detail = async (
  uuid: string
): Promise<AnnouncementVO> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    getApiBase() + `/announcement/detail/${uuid}`,
    ""
  );
  return parseData<AnnouncementVO>(res);
};

export const mark_announcement_read = async (
  uuid: string
): Promise<AnnouncementVO> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    getApiBase() + `/announcement/read/${uuid}`,
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
    getApiBase() + `/announcement/read/list/${uuid}`,
    JSON.stringify({ page_num: pageNum, page_size: pageSize, data: {} })
  );
  return parseData<AnnouncementReadUserListResult>(res);
};
