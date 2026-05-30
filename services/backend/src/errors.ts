/** Typed application errors, serialized as RFC 7807 problem+json. */

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }

  toProblem(): { type: string; title: string; status: number; code: string; detail?: string } {
    return {
      type: `https://field-iq.eonreality.com/errors/${this.code}`,
      title: this.message,
      status: this.statusCode,
      code: this.code,
      detail: this.detail,
    };
  }
}

export const badRequest = (msg: string, detail?: string): AppError =>
  new AppError(400, 'bad_request', msg, detail);
export const unauthorized = (msg = 'Unauthorized'): AppError =>
  new AppError(401, 'unauthorized', msg);
export const forbidden = (msg = 'Forbidden'): AppError => new AppError(403, 'forbidden', msg);
export const notFound = (msg = 'Not found'): AppError => new AppError(404, 'not_found', msg);
export const conflict = (msg: string, detail?: string): AppError =>
  new AppError(409, 'conflict', msg, detail);
