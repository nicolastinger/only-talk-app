import { HTTP_METHOD, TALK_API, CreateReportDTO } from "@workspace/types";
import { invoke_rust, parseBackendResponse } from "../httpService";

function parseData<T>(res: any): T {
  return parseBackendResponse<T>(res);
}

/** 提交举报 */
export const submit_report = async (
  dto: CreateReportDTO
): Promise<boolean> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    TALK_API + "/report/create",
    JSON.stringify(dto)
  );
  return parseData<boolean>(res);
};
