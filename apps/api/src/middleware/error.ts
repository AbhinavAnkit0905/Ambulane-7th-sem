import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';

  logger.error('Unhandled request error', {
    url: req.originalUrl,
    method: req.method,
    status,
    message,
    stack: err.stack
  });

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {})
  });
}
