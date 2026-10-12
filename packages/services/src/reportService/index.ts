import {
  HTTP_METHOD,
  CreateReportDTO,
  RustResponse,
} from "@workspace/types";
import { getApiBase, invoke_rust, parseBackendResponse } from "../httpService";

function parseData<T>(res: RustResponse): T {
  return parseBackendResponse<T>(res);
}

/** 提交举报 */
export const submit_report = async (dto: CreateReportDTO): Promise<boolean> => {
  const res = await invoke_rust(
    HTTP_METHOD.POST,
    getApiBase() + "/report/create",
    JSON.stringify(dto)
  );
  return parseData<boolean>(res);
};
