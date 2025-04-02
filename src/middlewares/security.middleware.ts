// src/middleware/security.middleware.ts
import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import hpp from 'hpp';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { 
  loginRateLimit, 
  apiRateLimit, 
  sensitiveOperationRateLimit 
} from '../config/auth';
import { appConfig } from '../config';
import { RateLimitExceededError } from '../utils/errors';

/**
 * Apply basic security middleware stack
 */
export const basicSecurity = () => [
  helmet(),
  
  cors({
    origin: appConfig.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
    credentials: true,
    maxAge: 86400 
  }),
  
  addRequestId(),
  
  
  hpp(),
  
  setSecurityHeaders(),
];

/**
 * Add a unique request ID to each request
 * This helps with request tracing across the system
 */
export const addRequestId = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestId = req.headers['x-request-id'] || uuidv4();
    
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-ID', requestId);
    
    next();
  };
};

/**
 * Configure additional security headers
 */
export const setSecurityHeaders = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
    
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'"
    );
    
    res.setHeader('Referrer-Policy', 'same-origin');
    
    res.setHeader('X-Frame-Options', 'DENY');
    
    next();
  };
};

/**
 * Configure API rate limiting middleware
 * Based on IP address and route pattern
 */
export const rateLimiter = (options: typeof apiRateLimit) => {
  const limiter = rateLimit({
    windowMs: options.windowMs,
    max: options.maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: { 
      success: false, 
      error: { 
        code: 'ERR_RATE_LIMIT',
        message: options.message
      }
    },
    keyGenerator: (req) => {
      return req.ip + (req.headers.authorization ? ':auth' : '');
    },
    skip: (req) => {
      return req.path === '/api/health';
    },
    handler: (req, res, next) => {
      next(new RateLimitExceededError(options.message));
    }
  });
  
  return limiter;
};

/**
 * Login attempt rate limiter - stricter than general API
 */
export const loginRateLimiter = rateLimiter(loginRateLimit);

/**
 * General API rate limiter
 */
export const generalRateLimiter = rateLimiter(apiRateLimit);

/**
 * Sensitive operations rate limiter
 */
export const sensitiveRateLimiter = rateLimiter(sensitiveOperationRateLimit);

/**
 * Middleware to detect suspicious activity patterns
 */
export const detectSuspiciousActivity = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    const suspiciousParams = ['$where', '$regex', '$gt', '$lt', 'exec(', 'eval('];
    const queryString = JSON.stringify(req.query).toLowerCase();
    
    for (const param of suspiciousParams) {
      if (queryString.includes(param)) {
        logger.warn('Suspicious query parameter detected', {
          ip: req.ip,
          path: req.path,
          query: req.query,
          param
        });
        break;
      }
    }
    
    const userAgent = req.headers['user-agent'] || '';
    if (
      userAgent.includes('sqlmap') ||
      userAgent.includes('nikto') ||
      userAgent.includes('nmap') ||
      userAgent.includes('masscan')
    ) {
      logger.warn('Suspicious user agent detected', {
        ip: req.ip,
        userAgent
      });
    }
    
    next();
  };
};

/**
 * Force HTTPS middleware - redirects HTTP to HTTPS
 */
export const forceHttps = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (appConfig.env === 'development') {
      return next();
    }
    
    const forwardedProto = req.headers['x-forwarded-proto'];
    
    if (forwardedProto && forwardedProto !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
    }
    
    next();
  };
};

export default {
  basicSecurity,
  addRequestId,
  setSecurityHeaders,
  rateLimiter,
  loginRateLimiter,
  generalRateLimiter,
  sensitiveRateLimiter,
  detectSuspiciousActivity,
  forceHttps
};