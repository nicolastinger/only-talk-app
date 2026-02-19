export const TALK_API = 'https://onlytalk.local:8443';

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
