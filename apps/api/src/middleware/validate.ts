import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';

export function validateBody(schema: AnyZodObject) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: 'Validation error',
          details: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
        });
        return;
      }
      res.status(400).json({ error: 'Invalid request payload' });
    }
  };
}

export function validateQuery(schema: AnyZodObject) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      req.query = await schema.parseAsync(req.query);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: 'Query validation error',
          details: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
        });
        return;
      }
      res.status(400).json({ error: 'Invalid query parameters' });
    }
  };
}
