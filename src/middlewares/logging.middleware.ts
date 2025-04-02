// src/middleware/logging.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../types';
import { appConfig } from '../config';

/**
 * Request logging middleware with performance metrics
 * Logs detailed information about incoming requests and their responses
 */
export const requestLogger = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/health' || req.path === '/api/health') {
      return next();
    }
    
    const startTime = process.hrtime();
    
    const originalEnd = res.end;
    
    res.end = function(chunk?: any, encodingOrCallback?: BufferEncoding | (() => void), callback?: () => void): Response {
      if (typeof encodingOrCallback === 'function') {
        callback = encodingOrCallback;
        encodingOrCallback = undefined;
      }
      const encoding = encodingOrCallback as BufferEncoding | undefined;
      const hrTime = process.hrtime(startTime);
      const duration = Math.round(hrTime[0] * 1000 + hrTime[1] / 1000000);
      
      const size = parseInt(res.getHeader('content-length') as string) || 0;
      
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      const logData: Record<string, any> = {
        method: req.method,
        path: req.originalUrl || req.url,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        size: `${size} bytes`,
        ip: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'] || 'unknown',
        requestId: req.headers['x-request-id'],
        referer: req.headers.referer
      };
      
      if (userId) {
        logData.userId = userId;
      }
      
      if (Object.keys(req.query).length > 0) {
        logData.query = sanitizeLogData(req.query);
      }
      
      if (appConfig.env === 'development' && req.method !== 'GET') {
        logData.body = sanitizeLogData(req.body);
      }
      
      const message = `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`;
      
      if (res.statusCode >= 500) {
        logger.error(message, logData);
      } else if (res.statusCode >= 400) {
        logger.warn(message, logData);
      } else {
        logger.info(message, logData);
      }
      
      return originalEnd.call(this, chunk, (encoding as BufferEncoding) || 'utf8', callback);
    };
    
    next();
  };
};

/**
 * Log slow requests to help identify performance bottlenecks
 * @param thresholdMs Threshold in milliseconds to consider a request slow
 */
export const slowRequestLogger = (thresholdMs: number = 1000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = process.hrtime();
    
    res.on('finish', () => {
      const hrTime = process.hrtime(startTime);
      const duration = Math.round(hrTime[0] * 1000 + hrTime[1] / 1000000);
      
      if (duration > thresholdMs) {
        logger.warn(`Slow request detected: ${req.method} ${req.originalUrl}`, {
          method: req.method,
          path: req.originalUrl,
          duration: `${duration}ms`,
          threshold: `${thresholdMs}ms`,
          ip: req.ip,
          requestId: req.headers['x-request-id']
        });
      }
    });
    
    next();
  };
};

/**
 * Audit logger for sensitive operations
 * Logs detailed information for auditing purposes
 */
export const auditLogger = () => {
    return (req: Request, res: Response, next: NextFunction) => {
      const authReq = req as AuthenticatedRequest;
      
      if (
        ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ||
        req.path.includes('/auth/') ||
        req.path.includes('/admin/')
      ) {
        const originalBody = { ...req.body };
        
        res.on('finish', () => {
          if (authReq.user || req.path.includes('/auth/')) {
            logger.info(`AUDIT: ${req.method} ${req.path}`, {
              method: req.method,
              path: req.originalUrl || req.url,
              statusCode: res.statusCode,
              ip: req.ip,
              userId: authReq.user?.id || 'unauthenticated',
              userRole: authReq.user?.role,
              requestId: req.headers['x-request-id'],
              requestData: sanitizeLogData(originalBody),
              timestamp: new Date().toISOString()
            });
          }
        });
      }
      
      next();
    };
  };
  

/**
 * Sanitize sensitive data before logging
 * @param data Data to sanitize
 */
const sensitiveFields = [
  'password', 
  'newPassword', 
  'currentPassword', 
  'token', 
  'secret', 
  'apiKey',
  'creditCard',
  'ssn',
  'socialSecurity',
  'pan',
  'cvv',
  'pin'
];

function sanitizeLogData(data: any): any {
  if (!data) return data;
  
  if (typeof data !== 'object') return data;
  
  if (Array.isArray(data)) {
    return data.map(item => sanitizeLogData(item));
  }
  
  const sanitized = { ...data };
  
  for (const key of Object.keys(sanitized)) {
    if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeLogData(sanitized[key]);
    }
  }
  
  return sanitized;
}

export default {
  requestLogger,
  slowRequestLogger,
  auditLogger
};