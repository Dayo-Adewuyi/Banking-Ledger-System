import authMiddleware from './auth.middleware';
import validationMiddleware from './validation.middleware';
import errorMiddleware from './error.middleware';
import securityMiddleware from './security.middleware';
import loggingMiddleware from './logging.middleware';
import performanceMiddleware from './performance.middleware';

export {
  authMiddleware,
  validationMiddleware,
  errorMiddleware,
  securityMiddleware,
  loggingMiddleware,
  performanceMiddleware
};

export default {
  auth: authMiddleware,
  validation: validationMiddleware,
  error: errorMiddleware,
  security: securityMiddleware,
  logging: loggingMiddleware,
  performance: performanceMiddleware
};