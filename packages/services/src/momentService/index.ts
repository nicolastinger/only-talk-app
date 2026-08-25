import {
  AddCommentDTO,
  CreateMomentDTO,
  HTTP_METHOD,
  LikeToggleDTO,
  MomentCommentListResult,
  MomentCommentVo,
  MomentListResult,
  MomentVo,
  TALK_API,
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

export const get_moment_list = async (
  pageNum = 1,
  pageSize = 20
): Promise<MomentListResult> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + "/moment/list",
    JSON.stringify({ page_num: pageNum, page_size: pageSize, data: {} })
  );
  return parseData<MomentListResult>(res);
};

export const get_moment_detail = async (
  momentUuid: string
): Promise<MomentVo> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + `/moment/detail/${momentUuid}`,
    ""
  );
  return parseData<MomentVo>(res);
};

export const create_moment = async (dto: CreateMomentDTO): Promise<MomentVo> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + "/moment/create",
    JSON.stringify(dto)
  );
  return parseData<MomentVo>(res);
};

export const switch_moment_like = async (
  dto: LikeToggleDTO
): Promise<boolean> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + "/moment/like/switch",
    JSON.stringify(dto)
  );
  return parseData<boolean>(res);
};

export const post_moment_comment = async (
  dto: AddCommentDTO
): Promise<MomentCommentVo> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + "/moment/comment",
    JSON.stringify(dto)
  );
  return parseData<MomentCommentVo>(res);
};

export const get_moment_comments = async (
  momentUuid: string,
  pageNum = 1,
  pageSize = 20
): Promise<MomentCommentListResult> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + "/moment/comment/list",
    JSON.stringify({
      page_num: pageNum,
      page_size: pageSize,
      data: { moment_uuid: momentUuid },
    })
  );
  return parseData<MomentCommentListResult>(res);
};
