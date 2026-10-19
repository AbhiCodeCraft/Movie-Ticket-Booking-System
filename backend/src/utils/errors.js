export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export function required(value) {
  if (!value) throw new ApiError(404, 'NOT_FOUND', 'Resource not found');
  return value;
}
