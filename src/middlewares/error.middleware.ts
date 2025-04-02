// src/middleware/error.middleware.ts
import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { JsonWebTokenError, TokenExpiredError, NotBeforeError } from 'jsonwebtoken';
import { 
  ApiError, 
  ValidationError,
  UnauthorizedError,
  ConflictError,
  DatabaseError,
  NotFoundError
} from '../utils/errors';
import { logger } from '../utils/logger';
import { isDevelopment } from '../config';

/**
 * Global error handler middleware
 * Catches all errors and formats them for client response
 */
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let error: ApiError;
  
  if (err instanceof ApiError) {
    error = err;
  } else if (err instanceof mongoose.Error.ValidationError) {
    const formattedErrors = formatMongooseValidationError(err);
    error = new ValidationError('Validation error', formattedErrors);
  } else if (err instanceof mongoose.Error.CastError) {
    error = new ValidationError(`Invalid ${err.kind}: ${err.value}`, {
      field: err.path,
      value: err.value,
      kind: err.kind
    });
  } else if ((err as any).code === 11000) {
    const field = getMongooseDuplicateKeyField(err as any);
    error = new ConflictError(`Duplicate value for ${field}`, {
      field,
      message: `A record with this ${field} already exists.`
    });
  } else if (
    err instanceof JsonWebTokenError ||
    err instanceof TokenExpiredError ||
    err instanceof NotBeforeError
  ) {
    error = new UnauthorizedError(
      err instanceof TokenExpiredError
        ? 'Your session has expired. Please log in again.'
        : 'Invalid authentication token',
      { tokenError: err.message }
    );
  } else if (err.name === 'MongoServerError') {
    error = new DatabaseError('Database operation failed', {
      code: (err as any).code,
      message: err.message
    });
  } else if (err.name === 'MongoNetworkError') {
    error = new DatabaseError('Database connection failed', {
      message: err.message
    });
  } else {
    error = new ApiError(
      500,
      'Internal server error occurred',
      undefined,
      'ERR_INTERNAL',
      false
    );
  }
  
  logError(error, req);
  
  const errorResponse = buildErrorResponse(error);
  
  res.status(error.statusCode).json(errorResponse);
};

/**
 * Central 404 handler for all routes
 * Triggered when no routes match the request
 */
export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  const error = new NotFoundError(`Resource not found: ${req.method} ${req.originalUrl}`);
  next(error);
};

/**
 * Uncaught exception handler
 * This provides a safety net for uncaught exceptions
 */
export const handleUncaughtException = (
  err: Error, 
  req: Request, 
  res: Response, 
  next: NextFunction
) => {
  logger.error('UNCAUGHT EXCEPTION IN REQUEST', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    body: req.body,
    params: req.params,
    query: req.query,
    ip: req.ip,
    headers: req.headers
  });
  
  res.status(500).json({
    success: false,
    error: {
      code: 'ERR_INTERNAL',
      message: 'An unexpected error occurred on the server'
    }
  });
};

/**
 * Transaction abort handler
 * Rollback transactions on error
 */
export const transactionErrorHandler = (session: mongoose.ClientSession) => {
  return async (err: any) => {
    try {
      await session.abortTransaction();
      session.endSession();
    } catch (abortError) {
      logger.error('Error aborting transaction', {
        originalError: err.message,
        abortError: abortError
      });
    }
    throw err;
  };
};

/**
 * Format Mongoose validation errors to a standard format
 */
const formatMongooseValidationError = (err: mongoose.Error.ValidationError) => {
  const formattedErrors = Object.entries(err.errors).map(([field, fieldError]) => {
    return {
      field,
      message: fieldError.message,
      value: fieldError.value,
      kind: fieldError.kind
    };
  });
  
  return formattedErrors;
};

/**
 * Extract field name from mongoose duplicate key error
 */
const getMongooseDuplicateKeyField = (err: any): string => {
  if (err.message.includes('index:')) {
    const match = err.message.match(/index:\s+(?:.*\.)?(\w+)/);
    if (match && match[1]) {
      return match[1].replace('_1', '');
    }
  }
  
  if (err.keyValue) {
    return Object.keys(err.keyValue)[0];
  }
  
  return 'unknown';
};

/**
 * Log error with appropriate level and details
 */
const logError = (error: ApiError, req: Request) => {
  const logData: {
    errorCode: string;
    statusCode: number;
    path: string;
    method: string;
    ip: string | undefined;
    details: any;
    stack?: string;
  } = {
    errorCode: error.code,
    statusCode: error.statusCode,
    path: req.path,
    method: req.method,
    ip: req.ip,
    details: error.details
  };
  
  if (!error.isOperational) {
    logData['stack'] = error.stack;
  }
  
  // Log with appropriate level based on status code
  if (error.statusCode >= 500) {
    logger.error(`Server Error: ${error.message}`, logData);
  } else if (error.statusCode >= 400) {
    logger.warn(`Client Error: ${error.message}`, logData);
  } else {
    logger.info(`Request Error: ${error.message}`, logData);
  }
};

/**
 * Build standardized error response object
 */
const buildErrorResponse = (error: ApiError) => {
  const response: any = {
    success: false,
    error: {
      code: error.code,
      message: error.message
    }
  };
  
  if (error.details) {
    response.error.details = error.details;
  }
  
  if (isDevelopment() && !error.isOperational) {
    response.error.stack = error.stack;
  }
  
  return response;
};

export default {
  errorHandler,
  notFoundHandler,
  handleUncaughtException,
  transactionErrorHandler
};