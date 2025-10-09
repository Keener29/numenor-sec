import type{ Request, Response, NextFunction } from 'express';
import { errorHandler as serviceErrorHandler } from '../services/errorHandler.js';

/**
 * Express middleware error handler that delegates to the comprehensive error service
 * This provides a consistent error handling interface for the Express app
 */
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Delegate to the comprehensive error handling service
  serviceErrorHandler(error, req, res, next);
};

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'ENDPOINT_NOT_FOUND',
      message: 'API endpoint not found',
      statusCode: 404,
      details: {
        path: req.path,
        method: req.method
      },
      timestamp: new Date().toISOString()
    }
  });
};
