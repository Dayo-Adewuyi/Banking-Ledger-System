import { Router } from 'express';
import { body } from 'express-validator';
import { AuthController } from '../controllers';
import { 
  authMiddleware, 
  validationMiddleware, 
  securityMiddleware 
} from '../middlewares';
import { wrapController } from '../utils';


const router = Router();

/**
 * Authentication Routes
 * Routes for handling user authentication, registration,
 * password management, and related operations
 */


const applyLoginRateLimiting = securityMiddleware.loginRateLimiter;

/**
 * @route POST /api/v1/auth/register
 * @desc Register a new user
 * @access Public
 */
router.post(
  '/register',
  validationMiddleware.authValidation.register,
  AuthController.register
);

/**
 * @route POST /api/v1/auth/login
 * @desc Log in a user and get authentication tokens
 * @access Public
 */
router.post(
  '/login',
  applyLoginRateLimiting,
  validationMiddleware.authValidation.login,
  AuthController.login
);

/**
 * @route POST /api/v1/auth/refresh
 * @desc Refresh access token using refresh token
 * @access Public
 */
router.post(
  '/refresh',
  validationMiddleware.authValidation.refreshToken,
  AuthController.refreshToken
);

/**
 * @route POST /api/v1/auth/logout
 * @desc Log out a user
 * @access Private
 */
router.post(
  '/logout',
  authMiddleware.authenticateJwt,
  wrapController(AuthController.logout)
);

/**
 * @route POST /api/v1/auth/password-reset-request
 * @desc Request a password reset
 * @access Public
 */
router.post(
  '/password-reset-request',
  validationMiddleware.validateRequest([
    body('email').isEmail().withMessage('Please provide a valid email address')
  ]),
  AuthController.requestPasswordReset
);

/**
 * @route POST /api/v1/auth/password-reset
 * @desc Reset password using token
 * @access Public
 */
router.post(
  '/password-reset',
  validationMiddleware.validateRequest([
    body('token').notEmpty().withMessage('Reset token is required'),
    body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
    body('confirmPassword').notEmpty().withMessage('Confirm password is required')
  ]),
  AuthController.resetPassword
);

/**
 * @route POST /api/v1/auth/change-password
 * @desc Change authenticated user's password
 * @access Private
 */
router.post(
  '/change-password',
  authMiddleware.authenticateJwt,
  validationMiddleware.validateRequest([
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters long'),
    body('confirmPassword').notEmpty().withMessage('Confirm password is required')
  ]),
 wrapController(
    AuthController.changePassword
  )
);

/**
 * @route POST /api/v1/auth/verify-email
 * @desc Verify email with token
 * @access Public
 */
router.post(
  '/verify-email',
  validationMiddleware.validateRequest([
    body('token').notEmpty().withMessage('Verification token is required')
  ]),
  AuthController.verifyEmail
);

/**
 * @route POST /api/v1/auth/resend-verification
 * @desc Resend verification email
 * @access Public
 */
router.post(
  '/resend-verification',
  validationMiddleware.validateRequest([
    body('email').isEmail().withMessage('Please provide a valid email address')
  ]),
  AuthController.resendVerification
);

/**
 * @route GET /api/v1/auth/me
 * @desc Get current authenticated user profile
 * @access Private
 */
router.get(
  '/me',
  authMiddleware.authenticateJwt,
    wrapController(AuthController.getCurrentUser)
);

/**
 * @route GET /api/v1/auth/status
 * @desc Check authentication status
 * @access Public
 */
router.get(
  '/status',
  authMiddleware.authenticateJwt,
    wrapController(AuthController.checkAuthStatus)
);

export default router;