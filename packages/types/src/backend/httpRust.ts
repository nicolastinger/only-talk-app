interface RustResponse {
  netSuccess: boolean;
  error?: string;
  res: HttpResponse;
}

interface HttpResponse {
  status: number;
  body: string;
}

/**
 * 后端统一成功/失败信封 (CommonResponse<T>):
 * { code, data, message } (data 在无返回时为 null 或 0)
 * T 为业务载荷 VO; 业务成功码为 200(带数据) 或 204(无数据)，其余视为失败
 */
interface BackendResponse<T> {
  code: number;
  data: T;
  message: string;
}

/**
 * 旧版直接 JSON.parse(res.body) 得到的原始信封。
 * data 形状未知，仅作兼容；新代码应使用 BackendResponse<T>。
 */
interface ResponseData {
  code: number;
  data: any;
  message: string;
}

export type { BackendResponse, HttpResponse, ResponseData, RustResponse };
