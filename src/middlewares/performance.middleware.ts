// src/middleware/performance.middleware.ts
import { Request, Response, NextFunction } from 'express';
import compression from 'compression';
import { logger } from '../utils/logger';
import NodeCache from 'node-cache';
import { appConfig } from '../config';

const cache = new NodeCache({
  stdTTL: 300, 
  checkperiod: 60, 
  useClones: false 
});

const CACHE_TTLS = {
  REFERENCE_DATA: 3600, 
  ACCOUNT_LIST: 60,     
  TRANSACTION_LIST: 30, 
  USER_PROFILE: 300,    
};

/**
 * Response compression middleware
 * Compresses responses to reduce bandwidth and improve loading times
 */
export const compressResponses = () => {
  return compression({
    threshold: 1024,
    filter: (req, res) => {
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    },
    level: 6
  });
};

/**
 * Get the cache instance for stats and management
 * @returns NodeCache instance
 */
export const getCache = () => {
    return cache;
  };
/**
 * Cache middleware for GET requests
 * @param duration Cache duration in seconds (defaults to 5 minutes)
 * @param keyPrefix Optional prefix for cache key
 */
export const cacheResponse = (duration: number = 300, keyPrefix: string = '') => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') {
      return next();
    }
    
    if (req.headers.authorization && !req.query.allowCache) {
      return next();
    }
    
    const key = `${keyPrefix}__cache__${req.originalUrl || req.url}`;
    
    const cachedBody = cache.get(key);
    
    if (cachedBody) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('Content-Type', 'application/json');
      return res.send(cachedBody);
    }
    
    const originalSend = res.send;
    
    res.send = function(body): Response {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        if (body && typeof body === 'string' && body.length > 0) {
          try {
            JSON.parse(body);
            cache.set(key, body, duration);
            res.setHeader('X-Cache', 'MISS');
          } catch (error) {
            logger.debug('Not caching invalid JSON response', { url: req.url });
          }
        }
      }
      
      return originalSend.call(this, body);
    };
    
    next();
  };
};

/**
 * Flush cache by pattern
 * @param pattern Pattern to match cache keys
 */
export const flushCache = (pattern: string): number => {
  const keys = cache.keys();
  let count = 0;
  
  for (const key of keys) {
    if (key.includes(pattern)) {
      const deleted = cache.del(key);
      count += deleted ? 1 : 0;
    }
  }
  
  logger.debug(`Flushed ${count} cache entries matching pattern: ${pattern}`);
  return count;
};

/**
 * ETag middleware for efficient caching
 * Provides weak ETags for efficient conditional requests
 */
export const etagCache = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') {
      return next();
    }
    
    const originalSend = res.send;
    
    res.send = function(body): Response {
      if (res.statusCode >= 200 && res.statusCode < 300 && body) {
        try {
       
          const etag = `W/"${Buffer.from(JSON.stringify(body)).toString('base64').substring(0, 27)}"`;
          
          res.setHeader('ETag', etag);
          
          const ifNoneMatch = req.headers['if-none-match'];
          
          if (ifNoneMatch && ifNoneMatch === etag) {
            res.status(304).send();
            return res;
          }
        } catch (error) {
          logger.debug('Error generating ETag', { error: (error as Error).message });
        }
      }
      
      return originalSend.call(this, body);
    };
    
    next();
  };
};

/**
 * Timeout middleware to prevent long-running requests
 * @param timeoutMs Maximum time in milliseconds
 */
export const requestTimeout = (timeoutMs: number = 30000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const timeout = setTimeout(() => {
      logger.warn(`Request timeout exceeded: ${req.method} ${req.url}`, {
        method: req.method,
        url: req.originalUrl || req.url,
        timeoutMs,
        ip: req.ip
      });
      
      if (!res.headersSent) {
        res.status(503).json({
          success: false,
          error: {
            code: 'ERR_TIMEOUT',
            message: 'Request processing timed out'
          }
        });
      }
    }, timeoutMs);
    
    res.on('finish', () => {
      clearTimeout(timeout);
    });
    
    next();
  };
};

/**
 * Monitor database query times
 * This middleware tracks query time from start to finish
 */
export const monitorDbPerformance = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    let queryCount = 0;
    
   
    const originalExec = require('mongoose').Query.prototype.exec;
    
    require('mongoose').Query.prototype.exec = function() {
      queryCount++;
      return originalExec.apply(this, arguments);
    };
    
    res.on('finish', () => {
      require('mongoose').Query.prototype.exec = originalExec;
      
      const duration = Date.now() - startTime;
      
      if (duration > 500 && queryCount > 0) {
        logger.warn(`Slow database operation: ${req.method} ${req.url}`, {
          method: req.method,
          url: req.originalUrl || req.url,
          duration: `${duration}ms`,
          queryCount,
          queriesPerSecond: (queryCount / (duration / 1000)).toFixed(2)
        });
      }
    });
    
    next();
  };
};

/**
 * CPU-intensive request detection
 * Tracks CPU time for requests and logs excessive usage
 */
export const monitorCpuIntensiveRequests = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (appConfig.env !== 'production') {
      return next();
    }
    
    const startTime = Date.now();
    const startCpuUsage = process.cpuUsage();
    
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const cpuUsage = process.cpuUsage(startCpuUsage);
      
      const totalCpuTimeMs = (cpuUsage.user + cpuUsage.system) / 1000;
      
      if (totalCpuTimeMs > duration * 0.5) {
        logger.warn(`CPU-intensive request: ${req.method} ${req.url}`, {
          method: req.method,
          url: req.originalUrl || req.url,
          duration: `${duration}ms`,
          cpuTimeMs: totalCpuTimeMs.toFixed(2),
          cpuPercentage: ((totalCpuTimeMs / duration) * 100).toFixed(2) + '%'
        });
      }
    });
    
    next();
  };
};

/**
 * Bulk data processing middleware
 * Sets optimal response handling for large datasets
 */
export const optimizeBulkResponses = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    const isBulkEndpoint = req.url.includes('/bulk') || 
                          req.url.includes('/export') || 
                          req.url.includes('/report');
    
    if (isBulkEndpoint || req.query.bulk === 'true') {
      req.setTimeout(120000); 
      
      if (req.query.size && parseInt(req.query.size as string) > 10000) {
        req.headers['x-no-compression'] = 'true';
      }
    }
    
    next();
  };
};

export const commonCachingRules = [
  cacheResponse(CACHE_TTLS.REFERENCE_DATA, 'ref'),
  
  cacheResponse(CACHE_TTLS.ACCOUNT_LIST, 'accounts'),
  
  cacheResponse(CACHE_TTLS.TRANSACTION_LIST, 'transactions'),
  
  cacheResponse(CACHE_TTLS.USER_PROFILE, 'user')
];

export default {
  compressResponses,
  cacheResponse,
  flushCache,
  etagCache,
  requestTimeout,
  monitorDbPerformance,
  monitorCpuIntensiveRequests,
  optimizeBulkResponses,
  CACHE_TTLS,
    getCache,
  commonCachingRules
};