import {
  AddCommentDTO,
  CreateMomentDTO,
  DeleteMomentDTO,
  FollowToggleDTO,
  HTTP_METHOD,
  LikeToggleDTO,
  MomentCommentListResult,
  MomentCommentVo,
  MomentLikerListResult,
  MomentListResult,
  MomentVo,
  RustResponse,
} from "@workspace/types";
import { getApiBase, invoke_rust, parseBackendResponse } from "../httpService";

function parseData<T>(res: RustResponse): T {
  return parseBackendResponse<T>(res);
}

export const get_moment_list = async (
  pageNum = 1,
  pageSize = 20,
  params?: { authorUuid?: string; feed?: string }
): Promise<MomentListResult> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    getApiBase() + "/moment/list",
    JSON.stringify({
      page_num: pageNum,
      page_size: pageSize,
      data: {
        author_uuid: params?.authorUuid,
        feed: params?.feed,
      },
    })
  );
  return parseData<MomentListResult>(res);
};

export const get_moment_detail = async (
  momentUuid: string
): Promise<MomentVo> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    getApiBase() + `/moment/detail/${momentUuid}`,
    ""
  );
  return parseData<MomentVo>(res);
};

export const create_moment = async (
  dto: CreateMomentDTO
): Promise<MomentVo> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    getApiBase() + "/moment/create",
    JSON.stringify(dto)
  );
  return parseData<MomentVo>(res);
};

export const delete_moment = async (dto: DeleteMomentDTO): Promise<boolean> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    getApiBase() + "/moment/delete",
    JSON.stringify(dto)
  );
  return parseData<boolean>(res);
};

export const switch_moment_like = async (
  dto: LikeToggleDTO
): Promise<boolean> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    getApiBase() + "/moment/like/switch",
    JSON.stringify(dto)
  );
  return parseData<boolean>(res);
};

export const switch_user_follow = async (
  dto: FollowToggleDTO
): Promise<boolean> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    getApiBase() + "/moment/follow/switch",
    JSON.stringify(dto)
  );
  return parseData<boolean>(res);
};

export const post_moment_comment = async (
  dto: AddCommentDTO
): Promise<MomentCommentVo> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    getApiBase() + "/moment/comment",
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
    getApiBase() + "/moment/comment/list",
    JSON.stringify({
      page_num: pageNum,
      page_size: pageSize,
      data: { moment_uuid: momentUuid },
    })
  );
  return parseData<MomentCommentListResult>(res);
};

export const get_moment_likers = async (
  momentUuid: string,
  pageNum = 1,
  pageSize = 20
): Promise<MomentLikerListResult> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    getApiBase() + "/moment/like/list",
    JSON.stringify({
      page_num: pageNum,
      page_size: pageSize,
      data: { moment_uuid: momentUuid },
    })
  );
  return parseData<MomentLikerListResult>(res);
};
