import {
  HTTP_METHOD,
  PlazaListResult,
  PlazaProfile,
  PlazaUpdateProfileDTO,
  PlazaUpdateTagsDTO,
  PlazaUser,
  PlazaListQuery,
  PlazaCrushToggleDTO,
  PlazaCrushResult,
  RustResponse,
} from "@workspace/types";
import { getApiBase, invoke_rust, parseBackendResponse } from "../httpService";

function parseData<T>(res: RustResponse): T {
  return parseBackendResponse<T>(res);
}

export const get_plaza_users = async (
  pageNum = 1,
  pageSize = 20,
  query?: PlazaListQuery
): Promise<PlazaListResult> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    getApiBase() + "/plaza/list",
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
    getApiBase() + `/plaza/user/${uuid}`,
    ""
  );
  return parseData<PlazaUser>(res);
};

export const get_plaza_profile = async (): Promise<PlazaProfile> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    getApiBase() + "/plaza/profile",
    ""
  );
  return parseData<PlazaProfile>(res);
};

export const update_plaza_profile = async (
  dto: PlazaUpdateProfileDTO
): Promise<boolean> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    getApiBase() + "/plaza/profile/update",
    JSON.stringify(dto)
  );
  return parseData<boolean>(res);
};

export const update_plaza_tags = async (
  dto: PlazaUpdateTagsDTO
): Promise<boolean> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    getApiBase() + "/plaza/tag/update",
    JSON.stringify(dto)
  );
  return parseData<boolean>(res);
};

export const switch_plaza_crush = async (
  dto: PlazaCrushToggleDTO
): Promise<PlazaCrushResult> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    getApiBase() + "/plaza/like/switch",
    JSON.stringify(dto)
  );
  return parseData<PlazaCrushResult>(res);
};

export const get_plaza_likes = async (
  pageNum = 1,
  pageSize = 20
): Promise<PlazaListResult> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    getApiBase() + "/plaza/like/list",
    JSON.stringify({ page_num: pageNum, page_size: pageSize, data: {} })
  );
  return parseData<PlazaListResult>(res);
};

export const get_plaza_matches = async (
  pageNum = 1,
  pageSize = 20
): Promise<PlazaListResult> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    getApiBase() + "/plaza/match/list",
    JSON.stringify({ page_num: pageNum, page_size: pageSize, data: {} })
  );
  return parseData<PlazaListResult>(res);
};
