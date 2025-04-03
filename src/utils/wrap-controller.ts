import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';

/**
 * Controller wrapper to handle type compatibility between 
 * Express Request type and our custom AuthenticatedRequest type
 * 
 * This utility function wraps controller methods to ensure type compatibility
 * with Express route handlers while still providing type safety
 * 
 * @param handler Controller method handler
 * @returns Express-compatible route handler
 */
export const wrapController = (
  handler: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>
) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
 
      await handler(req as AuthenticatedRequest, res, next);
    } catch (error) {
      next(error);
    }
  };
};

export default wrapController;