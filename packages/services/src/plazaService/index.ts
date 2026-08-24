import {
  HTTP_METHOD,
  TALK_API,
  PlazaListResult,
  PlazaProfile,
  PlazaUpdateProfileDTO,
  PlazaUpdateTagsDTO,
  PlazaUser,
  PlazaListQuery,
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

export const get_plaza_users = async (
  pageNum = 1,
  pageSize = 20,
  query?: PlazaListQuery
): Promise<PlazaListResult> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + "/plaza/list",
    JSON.stringify({
      page_num: pageNum,
      page_size: pageSize,
      data: query || {},
    })
  );
  return parseData<PlazaListResult>(res);
};

export const get_plaza_user = async (uuid: string): Promise<PlazaUser> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + `/plaza/user/${uuid}`,
    ""
  );
  return parseData<PlazaUser>(res);
};

export const get_plaza_profile = async (): Promise<PlazaProfile> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + "/plaza/profile",
    ""
  );
  return parseData<PlazaProfile>(res);
};

export const update_plaza_profile = async (
  dto: PlazaUpdateProfileDTO
): Promise<boolean> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + "/plaza/profile/update",
    JSON.stringify(dto)
  );
  return parseData<boolean>(res);
};

export const update_plaza_tags = async (
  dto: PlazaUpdateTagsDTO
): Promise<boolean> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + "/plaza/tag/update",
    JSON.stringify(dto)
  );
  return parseData<boolean>(res);
};
