
/*
* This file contains interfaces related to authentication and authorization.
* It includes the structure of JWT configuration, password policy,
* rate limiting configuration, and user roles and permissions.
* The JwtConfig interface defines the properties for JWT secret, expiration times,
* issuer, and audience.
* The PasswordPolicy interface defines the rules for password strength and expiration.
* The RateLimitConfig interface defines the rate limiting settings for API requests.
* The roles and permissions are defined as constants for user access control.
* The rolePermissions object maps roles to their respective permissions.
* The jwtOptions object is used for configuring the JWT strategy in Passport.js.
*/
export interface JwtConfig {
    secret: string;
    accessExpiresIn: string;
    refreshSecret: string;
    refreshExpiresIn: string;
    issuer: string;
    audience: string;
  }
  
  export interface PasswordPolicy {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
    preventPasswordReuse: number;  
    maxAge: number;             
  }
  
  export interface RateLimitConfig {
    windowMs: number;         
    maxRequests: number;     
    message: string;        
  }
  