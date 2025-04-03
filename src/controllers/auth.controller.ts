import { Request, Response, NextFunction } from 'express';
import   {UserService}  from '../services';
import { AuthenticatedRequest } from '../types';
import { 
  BadRequestError, 
  UnauthorizedError, 
  ValidationError 
} from '../utils/errors';
import { authLogger } from '../utils/logger';
import { loginRateLimit, sensitiveOperationRateLimit } from '../config/auth';
import { securityMiddleware } from '../middlewares';
import { validatePassword } from '../utils/validators';

/**
 * Auth Controller
 * Handles all authentication-related operations including login, registration,
 * password reset, token refresh and other account security features
 */
export class AuthController {
  /**
   * Register a new user
   * @route POST /api/v1/auth/register
   */
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userData = req.body;

      if (userData.password !== userData.confirmPassword) {
        throw new ValidationError('Passwords do not match');
      }

      const passwordCheck = validatePassword(userData.password);
      if (!passwordCheck.valid) {
        throw new ValidationError(passwordCheck.message || 'Password does not meet security requirements');
      }

      const { confirmPassword, ...userDataToSave } = userData;

      const createdUser = await UserService.createUser(userDataToSave);

      authLogger.info(`User registered successfully: ${createdUser.id}`, {
        userId: createdUser.id,
        email: createdUser.email,
        ip: req.ip
      });

      res.status(201).json({
        success: true,
        message: 'User registered successfully. Please check your email for verification instructions.',
        data: createdUser
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Log in a user
   * @route POST /api/v1/auth/login
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body;

      const rateLimiter = securityMiddleware.rateLimiter(loginRateLimit);
      await new Promise((resolve, reject) => {
        rateLimiter(req, res, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve(true);
          }
        });
      });

      const authResponse = await UserService.login({ email, password });

      if (process.env.USE_SECURE_COOKIES === 'true') {
        res.cookie('refreshToken', authResponse.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000, 
          path: '/api/v1/auth/refresh'
        });
      }

      authLogger.info(`User logged in: ${authResponse.user.id}`, {
        userId: authResponse.user.id,
        email: authResponse.user.email,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: authResponse
      });
    } catch (error) {
      console.trace(error);
      if (error instanceof UnauthorizedError) {
        authLogger.warn(`Login failed: ${error.message}`, {
          email: req.body.email,
          ip: req.ip,
          errorDetails: error.details
        });

        return next(new UnauthorizedError('Invalid credentials'));
      }
      next(error);
    }
  }

  /**
   * Refresh access token using refresh token
   * @route POST /api/v1/auth/refresh
   */
  async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      let refreshToken = req.body.refreshToken;
      
      if (!refreshToken && req.cookies && req.cookies.refreshToken) {
        refreshToken = req.cookies.refreshToken;
      }

      if (!refreshToken) {
        throw new BadRequestError('Refresh token is required');
      }

      const authResponse = await UserService.refreshAccessToken(refreshToken);

      if (process.env.USE_SECURE_COOKIES === 'true') {
        res.cookie('refreshToken', authResponse.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000,
          path: '/api/v1/auth/refresh'
        });
      }

      authLogger.info(`Token refreshed for user: ${authResponse.user.id}`, {
        userId: authResponse.user.id,
        ip: req.ip
      });

      res.status(200).json({
        success: true,
        message: 'Token refreshed successfully',
        data: authResponse
      });
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        if (process.env.USE_SECURE_COOKIES === 'true' && req.cookies.refreshToken) {
          res.clearCookie('refreshToken');
        }
      }
      next(error);
    }
  }

  /**
   * Log out a user
   * @route POST /api/v1/auth/logout
   */
  async logout(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (process.env.USE_SECURE_COOKIES === 'true') {
        res.clearCookie('refreshToken', {
          path: '/api/v1/auth/refresh'
        });
      }

      if (req.user) {
        authLogger.info(`User logged out: ${req.user.id}`, {
          userId: req.user.id,
          ip: req.ip
        });
      }

      res.status(200).json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Request password reset
   * @route POST /api/v1/auth/password-reset-request
   */
  async requestPasswordReset(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body;

      const rateLimiter = securityMiddleware.rateLimiter(sensitiveOperationRateLimit);
      await new Promise((resolve, reject) => {
        rateLimiter(req, res, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve(true);
          }
        });
      });

      await UserService.requestPasswordReset({ email });

      res.status(200).json({
        success: true,
        message: 'If the email exists in our system, a password reset link has been sent.'
      });
    } catch (error) {
      authLogger.error(`Password reset request error: ${(error as Error).message}`, {
        email: req.body.email,
        ip: req.ip,
        error: error
      });

      res.status(200).json({
        success: true,
        message: 'If the email exists in our system, a password reset link has been sent.'
      });
    }
  }

  /**
   * Reset password using token
   * @route POST /api/v1/auth/password-reset
   */
  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token, newPassword, confirmPassword } = req.body;

      if (newPassword !== confirmPassword) {
        throw new ValidationError('Passwords do not match');
      }

      const rateLimiter = securityMiddleware.rateLimiter(sensitiveOperationRateLimit);
      await new Promise((resolve, reject) => {
        rateLimiter(req, res, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve(true);
          }
        });
      });

      await UserService.resetPassword({ token, newPassword, confirmPassword });

      res.status(200).json({
        success: true,
        message: 'Password has been reset successfully. You can now log in with your new password.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Change password (authenticated user)
   * @route POST /api/v1/auth/change-password
   */
  async changePassword(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const { currentPassword, newPassword, confirmPassword } = req.body;

      const rateLimiter = securityMiddleware.rateLimiter(sensitiveOperationRateLimit);
      await new Promise((resolve, reject) => {
        rateLimiter(req, res, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve(true);
          }
        });
      });

      await UserService.changePassword(req.user.id, {
        currentPassword,
        newPassword,
        confirmPassword
      });

      res.status(200).json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verify email address with token
   * @route POST /api/v1/auth/verify-email
   */
  async verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token } = req.body;

      if (!token) {
        throw new BadRequestError('Verification token is required');
      }

      await UserService.verifyEmail(token);

      res.status(200).json({
        success: true,
        message: 'Email verified successfully. You can now log in to your account.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Resend verification email
   * @route POST /api/v1/auth/resend-verification
   */
  async resendVerification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body;

      if (!email) {
        throw new BadRequestError('Email is required');
      }

      const rateLimiter = securityMiddleware.rateLimiter(sensitiveOperationRateLimit);
      await new Promise((resolve, reject) => {
        rateLimiter(req, res, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve(true);
          }
        });
      });

      
    //   await UserService.resendVerificationEmail(email);

      res.status(200).json({
        success: true,
        message: 'If the email exists and requires verification, a new verification email has been sent.'
      });
    } catch (error) {
      authLogger.error(`Resend verification error: ${(error as Error).message}`, {
        email: req.body.email,
        ip: req.ip,
        error: error
      });

      res.status(200).json({
        success: true,
        message: 'If the email exists and requires verification, a new verification email has been sent.'
      });
    }
  }

  /**
   * Get current user profile (authenticated)
   * @route GET /api/v1/auth/me
   */
  async getCurrentUser(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const user = await UserService.getUserById(req.user.id);

      res.status(200).json({
        success: true,
        data: user
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Check authentication status
   * Simple endpoint to check if the user is authenticated
   * @route GET /api/v1/auth/status
   */
  async checkAuthStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (req.user) {
      res.status(200).json({
        success: true,
        authenticated: true,
        user: {
          id: req.user.id,
          email: req.user.email,
          role: req.user.role
        }
      });
    } else {
      res.status(200).json({
        success: true,
        authenticated: false
      });
    }
  }
}

export default new AuthController();