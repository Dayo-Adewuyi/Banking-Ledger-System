// src/utils/errors.ts
import { Request, Response, NextFunction } from 'express';
import { isDevelopment } from '../config';
import { logger } from './logger';

/**
 * Base API Error class for consistent error handling
 */
export class ApiError extends Error {
  statusCode: number;
  code: string;
  details?: any;
  isOperational: boolean;

  constructor(
    statusCode: number,
    message: string,
    details?: any,
    code?: string,
    isOperational = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code || this.generateErrorCode(statusCode, message);
    this.details = details;
    this.isOperational = isOperational; 
    
    Error.captureStackTrace(this, this.constructor);    
    Object.setPrototypeOf(this, ApiError.prototype);
  }
  
  /**
   * Generate a unique error code based on status and message
   */
  private generateErrorCode(statusCode: number, message: string): string {
    const prefix = statusCode.toString();
    const slug = message
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .substring(0, 20);
    
    return `ERR_${prefix}_${slug}`;
  }
}

/**
 * Not Found Error (404)
 */
export class NotFoundError extends ApiError {
  constructor(message: string = 'Resource not found', details?: any) {
    super(404, message, details, 'ERR_NOT_FOUND');
  }
}

/**
 * Bad Request Error (400)
 */
export class BadRequestError extends ApiError {
  constructor(message: string = 'Bad request', details?: any) {
    super(400, message, details, 'ERR_BAD_REQUEST');
  }
}

/**
 * Unauthorized Error (401)
 */
export class UnauthorizedError extends ApiError {
  constructor(message: string = 'Unauthorized', details?: any) {
    super(401, message, details, 'ERR_UNAUTHORIZED');
  }
}

/**
 * Forbidden Error (403)
 */
export class ForbiddenError extends ApiError {
  constructor(message: string = 'Forbidden', details?: any) {
    super(403, message, details, 'ERR_FORBIDDEN');
  }
}

/**
 * Conflict Error (409)
 */
export class ConflictError extends ApiError {
  constructor(message: string = 'Resource conflict', details?: any) {
    super(409, message, details, 'ERR_CONFLICT');
  }
}

/**
 * Validation Error (422)
 */
export class ValidationError extends ApiError {
  constructor(message: string = 'Validation error', details?: any) {
    super(422, message, details, 'ERR_VALIDATION');
  }
}

/**
 * Service Unavailable Error (503)
 */
export class ServiceUnavailableError extends ApiError {
  constructor(message: string = 'Service unavailable', details?: any) {
    super(503, message, details, 'ERR_SERVICE_UNAVAILABLE');
  }
}

/**
 * Database Error (500 with specific code)
 */
export class DatabaseError extends ApiError {
  constructor(message: string = 'Database error', details?: any) {
    super(500, message, details, 'ERR_DATABASE', false);
  }
}

/**
 * Transaction Error 
 */
export class TransactionError extends ApiError {
  constructor(message: string = 'Transaction error', details?: any) {
    super(400, message, details, 'ERR_TRANSACTION');
  }
}

/**
 * Insufficient Funds Error 
 */
export class InsufficientFundsError extends ApiError {
  constructor(message: string = 'Insufficient funds', details?: any) {
    super(400, message, details, 'ERR_INSUFFICIENT_FUNDS');
  }
}

/**
 * Account Locked Error 
 */
export class AccountLockedError extends ApiError {
  constructor(message: string = 'Account is locked', details?: any) {
    super(403, message, details, 'ERR_ACCOUNT_LOCKED');
  }
}

/**
 * Rate Limit Exceeded Error
 */
export class RateLimitExceededError extends ApiError {
  constructor(message: string = 'Rate limit exceeded', details?: any) {
    super(429, message, details, 'ERR_RATE_LIMIT');
  }
}

/**
 * Global error handler middleware
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
  } else if (err.name === 'ValidationError') {
    error = new ValidationError('Validation error', err);
  } else if (err.name === 'MongoError' || err.name === 'MongoServerError') {
    const mongoErr = err as any;
    if (mongoErr.code === 11000) {
      error = new ConflictError('Duplicate key error', mongoErr);
    } else {
      error = new DatabaseError('Database error', mongoErr);
    }
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    error = new UnauthorizedError('Invalid or expired token', err);
  } else {
    error = new ApiError(
      500,
      'Internal server error',
      undefined,
      'ERR_INTERNAL',
      false
    );
  }
  
  if (error.statusCode >= 500) {
    logger.error(`[${error.code}] ${error.message}`, {
      stack: error.stack,
      details: error.details,
      path: req.path,
      method: req.method,
      ip: req.ip
    });
  } else {
    logger.warn(`[${error.code}] ${error.message}`, {
      details: error.details,
      path: req.path,
      method: req.method
    });
  }
  
  const response: {
    success: boolean;
    error: {
      code: string;
      message: string;
      details: any;
      stack?: string;
    };
  } = {
    success: false,
    error: {
      code: error.code,
      message: error.message,
      details: error.details
    }
  };
  
  if (isDevelopment() && !error.isOperational) {
    response.error.stack = error.stack;
  }
  
  res.status(error.statusCode).json(response);
};

/**
 * Handle uncaught exceptions and unhandled rejections
 */
export const setupErrorHandlers = () => {
  process.on('uncaughtException', (error: Error) => {
    logger.error('UNCAUGHT EXCEPTION! 💥 Shutting down...', {
      error: error.message,
      stack: error.stack
    });
    
    process.exit(1);
  });
  
  process.on('unhandledRejection', (reason: Error) => {
    logger.error('UNHANDLED REJECTION! 💥 Shutting down...', {
      error: reason.message,
      stack: reason.stack
    });
    
    process.exit(1);
  });
  
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received. Shutting down gracefully');
    process.exit(0);
  });
};

export default {
  ApiError,
  NotFoundError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  ValidationError,
  ServiceUnavailableError,
  DatabaseError,
  TransactionError,
  InsufficientFundsError,
  AccountLockedError,
  RateLimitExceededError,
  errorHandler,
  setupErrorHandlers
};