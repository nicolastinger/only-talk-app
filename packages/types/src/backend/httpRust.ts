interface RustResponse {
  netSuccess: boolean;
  error?: string;
  res: HttpResponse;
}

interface HttpResponse {
  status: number;
  body: string;
}

interface ResponseData {
  code: number;
  data: never;
  message: string;
}

export type { HttpResponse, ResponseData, RustResponse};