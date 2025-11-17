export const DEFAULT_NAME = 'Umi Max';
export const TALK_API = 'https://onlytalk.local:8443'; // 全局变量

export const DEFAULT_ICON =
  'https://ss1.bdstatic.com/70cFvXSh_Q1YnxGkpoWK1HF6hhy/it/u=3663778712,1545220977&fm=253&gp=0.jpg';
export const SYSTEM_ACCOUNT = 'system';
export const HTTP_METHOD = {
  GET: 'GET',
  POST: 'post_request',
  PUT: 'PUT',
  DELETE: 'DELETE',
};

export const HttpStatusMap: Map<number, string> = new Map([
  [200, 'OK'],
  [400, 'Bad Request'],
  [401, 'Unauthorized'],
  [403, 'Forbidden'],
  [404, 'Not Found'],
  [500, 'Internal Server Error'],
]);
