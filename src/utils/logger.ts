import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { isDevelopment, appConfig } from '../config';
import path from 'path';
import fs from 'fs';
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';

const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaString = Object.keys(meta).length 
      ? `\n${JSON.stringify(meta, null, 2)}` 
      : '';
    return `[${timestamp}] ${level}: ${message}${metaString}`;
  })
);

const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.json()
);

const sanitizeSecrets = winston.format((info) => {
  const message = info.message as string | undefined;

  if (message && typeof message === 'string') {
    info.message = message.replace(
      /(eyJ[a-zA-Z0-9_-]{5,}\.eyJ[a-zA-Z0-9_-]{5,}\.[a-zA-Z0-9_-]{5,})/g,
      '[REDACTED_JWT]'
    ).replace(
      /"(password|secret|key|token|authorization)"\s*:\s*"[^"]*"/gi,
      '"$1":"[REDACTED]"'
    );
  }
  
  if (info.meta) {
    const sensitiveFields = ['password', 'secret', 'key', 'token', 'authorization'];
    const sanitizeObject = (obj: any) => {
      if (!obj || typeof obj !== 'object') return obj;

      const newObj = { ...obj };
      for (const key of Object.keys(newObj)) {
        if (sensitiveFields.includes(key.toLowerCase())) {
          newObj[key] = '[REDACTED]';
        } else if (typeof newObj[key] === 'object') {
          newObj[key] = sanitizeObject(newObj[key]);
        }
      }
      return newObj;
    };

    info.meta = sanitizeObject(info.meta);
  }

  return info;
});

const transports: winston.transport[] = [
  new DailyRotateFile({
    filename: path.join(logDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    format: winston.format.combine(
      sanitizeSecrets(),
      fileFormat
    ),
    zippedArchive: true, 
    maxSize: '20m', 
    maxFiles: '14d' 
  }),

  new DailyRotateFile({
    filename: path.join(logDir, 'combined-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    format: winston.format.combine(
      sanitizeSecrets(),
      fileFormat
    ),
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d'
  })
];

if (isDevelopment()) {
  transports.push(
    new winston.transports.Console({
      level: 'debug',
      format: winston.format.combine(
        sanitizeSecrets(),
        consoleFormat
      )
    })
  );
} else {
  transports.push(
    new winston.transports.Console({
      level: 'info',
      format: winston.format.combine(
        sanitizeSecrets(),
        consoleFormat
      )
    })
  );
}

export const logger = winston.createLogger({
  level: appConfig.logLevel || (isDevelopment() ? 'debug' : 'info'),
  levels: winston.config.npm.levels,
  defaultMeta: { service: 'banking-ledger-api' },
  transports
});

export const requestLogger = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.path === '/health' || req.path === '/api/health') {
    return next();
  }
  
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const message = `${req.method} ${req.originalUrl || req.url} ${res.statusCode} ${duration}ms`;
    
    const meta: {
      ip: string | undefined;
      method: string;
      url: string;
      statusCode: number;
      userAgent: string;
      duration: number;
      userId?: string;
    } = {
      ip: req.ip || req.socket.remoteAddress,
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      userAgent: req.headers['user-agent'] || '',
      duration
    };
    
    if (req.user && req.user.id) {
      meta['userId'] = req.user.id;
    }
    
    if (res.statusCode >= 500) {
      logger.error(message, { meta, requestBody: req.body });
    } else if (res.statusCode >= 400) {
      logger.warn(message, { meta });
    } else {
      logger.info(message, { meta });
    }
  });
  
  next();
};

export const transactionLogger = logger.child({ 
  module: 'transactions',
  defaultMeta: { correlationId: () => require('crypto').randomUUID() }
});

export const accountLogger = logger.child({ module: 'accounts' });
export const authLogger = logger.child({ module: 'auth' });
export const systemLogger = logger.child({ module: 'system' });

export default logger;
