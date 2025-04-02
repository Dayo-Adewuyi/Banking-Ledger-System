
import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { jwtConfig } from '../config/auth';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import { AuthenticatedRequest, JwtUserPayload } from '../types';
import { logger } from '../utils/logger';

/**
 * Middleware to verify JWT token and authenticate user
 */
export const authenticateJwt = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }
    
    const token = authHeader.split(' ')[1];
    
    const decoded = jwt.verify(token, jwtConfig.secret, {
      issuer: jwtConfig.issuer,
      audience: jwtConfig.audience
    }) as JwtUserPayload;
    
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      permissions: decoded.permissions || []
    };
    
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError('Invalid token'));
    } else if (error instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Token expired'));
    } else if (error instanceof jwt.NotBeforeError) {
      next(new UnauthorizedError('Token not active yet'));
    } else {
      next(error);
    }
  }
};

/**
 * Middleware to check if user has required roles
 * @param roles Array of roles that are allowed
 */
export const hasRole = (roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('User not authenticated'));
    }
    
    if (!roles.includes(req.user.role)) {
      logger.warn(`Access denied: User ${req.user.id} with role ${req.user.role} attempted to access restricted resource`, {
        path: req.path,
        method: req.method,
        roles: roles
      });
      
      return next(new ForbiddenError('Insufficient role permissions'));
    }
    
    next();
  };
};

/**
 * Middleware to check if user has required permissions
 * @param requiredPermissions Array of permissions that are required
 */
export const hasPermission = (requiredPermissions: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('User not authenticated'));
    }
    
    const hasAllPermissions = requiredPermissions.every(permission => 
      req.user!.permissions.includes(permission)
    );
    
    if (!hasAllPermissions) {
      logger.warn(`Permission denied: User ${req.user.id} with permissions [${req.user.permissions.join(', ')}] attempted to access resource requiring [${requiredPermissions.join(', ')}]`, {
        path: req.path,
        method: req.method
      });
      
      return next(new ForbiddenError('Insufficient permissions'));
    }
    
    next();
  };
};

/**
 * Middleware to check if user is accessing their own resources
 * @param paramIdField The request parameter containing the user ID to check against
 */
export const isResourceOwner = (paramIdField: string = 'userId') => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('User not authenticated'));
    }
    
    const resourceUserId = req.params[paramIdField];
    
    if (req.user.role === 'admin') {
      return next();
    }
    
    if (resourceUserId !== req.user.id) {
      logger.warn(`Ownership check failed: User ${req.user.id} attempted to access resource owned by ${resourceUserId}`, {
        path: req.path,
        method: req.method
      });
      
      return next(new ForbiddenError('You can only access your own resources'));
    }
    
    next();
  };
};

export const verifyCallback = async (jwtPayload: JwtUserPayload, done: any) => {
  try {
  
    if (!jwtPayload.id || !jwtPayload.role) {
      return done(null, false);
    }
    
    return done(null, {
      id: jwtPayload.id,
      email: jwtPayload.email,
      role: jwtPayload.role,
      permissions: jwtPayload.permissions || []
    });
  } catch (error) {
    logger.error('JWT verification error', { error: (error as Error).message });
    return done(error, false);
  }
};

export default {
  authenticateJwt,
  hasRole,
  hasPermission,
  isResourceOwner,
  verifyCallback
};