import type { Request, Response, NextFunction } from 'express';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
}

export function errorHandler(err: ApiError, _req: Request, res: Response, _next: NextFunction): void {
  const statusCode = err.statusCode ?? 500;
  const code = err.code ?? 'INTERNAL_ERROR';
  const message = err.message ?? 'An unexpected error occurred';

  res.status(statusCode).json({
    error: {
      code,
      message,
      details: err.details ?? undefined,
    },
  });
}

export function createError(statusCode: number, code: string, message: string, details?: unknown): ApiError {
  const error = new Error(message) as ApiError;
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}
