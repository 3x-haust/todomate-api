export class TodomateError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 500) {
    super(message);
    this.name = "TodomateError";
    this.code = code;
    this.status = status;
  }
}

export function responseError(code: string, message: string, status: number): TodomateError {
  return new TodomateError(code, message, status);
}
