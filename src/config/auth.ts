import { ExtractJwt, StrategyOptions } from 'passport-jwt';
import { JwtConfig, PasswordPolicy, RateLimitConfig } from '../interfaces';


export const jwtConfig: JwtConfig = {
  secret: process.env.JWT_SECRET || 'super-banking-secret-change-in-production',
  accessExpiresIn: process.env.JWT_EXPIRES_IN || '1h',     
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'super-refresh-secret-change-in-production',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  issuer: process.env.JWT_ISSUER || 'banking-ledger-api',
  audience: process.env.JWT_AUDIENCE || 'banking-clients'
};

export const roles = {
  USER: 'user',
  ADMIN: 'admin',
  SYSTEM: 'system'
};

export const permissions = {
  VIEW_ACCOUNT: 'view:account',
  CREATE_ACCOUNT: 'create:account',
  UPDATE_ACCOUNT: 'update:account',
  DELETE_ACCOUNT: 'delete:account',
  
  VIEW_TRANSACTION: 'view:transaction',
  CREATE_DEPOSIT: 'create:deposit',
  CREATE_WITHDRAWAL: 'create:withdrawal',
  CREATE_TRANSFER: 'create:transfer',
  
  MANAGE_USERS: 'manage:users',
  VIEW_AUDIT_LOGS: 'view:audit-logs'
};

export const rolePermissions = {
  [roles.USER]: [
    permissions.VIEW_ACCOUNT,
    permissions.CREATE_ACCOUNT,
    permissions.VIEW_TRANSACTION,
    permissions.CREATE_DEPOSIT,
    permissions.CREATE_WITHDRAWAL,
    permissions.CREATE_TRANSFER
  ],
  [roles.ADMIN]: [
    ...Object.values(permissions)
  ],
  [roles.SYSTEM]: [
    ...Object.values(permissions)
  ]
};

export const jwtOptions: StrategyOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: jwtConfig.secret,
  issuer: jwtConfig.issuer,
  audience: jwtConfig.audience
};

export const passwordPolicy: PasswordPolicy = {
  minLength: parseInt(process.env.PASSWORD_MIN_LENGTH || '12', 10),
  requireUppercase: process.env.PASSWORD_REQUIRE_UPPERCASE !== 'false',
  requireLowercase: process.env.PASSWORD_REQUIRE_LOWERCASE !== 'false',
  requireNumbers: process.env.PASSWORD_REQUIRE_NUMBERS !== 'false',
  requireSpecialChars: process.env.PASSWORD_REQUIRE_SPECIAL !== 'false',
  preventPasswordReuse: parseInt(process.env.PASSWORD_PREVENT_REUSE || '5', 10),
  maxAge: parseInt(process.env.PASSWORD_MAX_AGE || '90', 10)
};

export const loginRateLimit: RateLimitConfig = {
  windowMs: 15 * 60 * 1000, 
  maxRequests: 5,         
  message: 'Too many login attempts, please try again later'
};

export const apiRateLimit: RateLimitConfig = {
  windowMs: 60 * 1000,    
  maxRequests: 100,       
  message: 'Too many requests, please try again later'
};

export const sensitiveOperationRateLimit: RateLimitConfig = {
  windowMs: 60 * 60 * 1000, 
  maxRequests: 10,          
  message: 'Too many sensitive operations, please try again later'
};

export default {
  jwtConfig,
  jwtOptions,
  roles,
  permissions,
  rolePermissions,
  passwordPolicy,
  loginRateLimit,
  apiRateLimit,
  sensitiveOperationRateLimit
};