import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { AccountController } from '../controllers';
import { 
  authMiddleware, 
  validationMiddleware, 
  performanceMiddleware 
} from '../middlewares';

import { wrapController } from '../utils';
const router = Router();

/**
 * Account Routes
 * Routes for handling account management, balance inquiries,
 * account transactions, and related operations
 */

// Apply common performance middleware for account-related endpoints
router.use(performanceMiddleware.requestTimeout(15000)); // 15 seconds timeout

/**
 * @route POST /api/v1/accounts
 * @desc Create a new account
 * @access Private
 */
router.post(
  '/',
  authMiddleware.authenticateJwt,
  validationMiddleware.accountValidation.create,
 wrapController(AccountController.createAccount)
);

/**
 * @route GET /api/v1/accounts
 * @desc Get all accounts for the authenticated user
 * @access Private
 */
router.get(
  '/',
  authMiddleware.authenticateJwt,
  validationMiddleware.accountValidation.list,
  performanceMiddleware.cacheResponse(60, 'accounts'), 
  wrapController(AccountController.getUserAccounts)
);

/**
 * @route GET /api/v1/accounts/summary
 * @desc Get account summary with balance totals
 * @access Private
 */
router.get(
  '/summary',
  authMiddleware.authenticateJwt,
  performanceMiddleware.cacheResponse(60, 'accounts-summary'), 
    wrapController(AccountController.getAccountsSummary)
);

/**
 * @route GET /api/v1/accounts/:id
 * @desc Get account by ID
 * @access Private
 */
router.get(
  '/:id',
  authMiddleware.authenticateJwt,
  validationMiddleware.accountValidation.getById,
  wrapController(AccountController.getAccountById)
);

/**
 * @route GET /api/v1/accounts/number/:accountNumber
 * @desc Get account by account number
 * @access Private
 */
router.get(
  '/number/:accountNumber',
  authMiddleware.authenticateJwt,
  validationMiddleware.accountValidation.getByAccountNumber,
  wrapController(AccountController.getAccountByNumber)
);

/**
 * @route PATCH /api/v1/accounts/:id
 * @desc Update account details
 * @access Private
 */
router.patch(
  '/:id',
  authMiddleware.authenticateJwt,
  validationMiddleware.accountValidation.update,
  wrapController(AccountController.updateAccount)
);

/**
 * @route GET /api/v1/accounts/:id/balance
 * @desc Get account balance
 * @access Private
 */
router.get(
  '/:id/balance',
  authMiddleware.authenticateJwt,
  validationMiddleware.validateRequest([
    param('id').isMongoId().withMessage('Invalid account ID format')
  ]),
  wrapController(AccountController.getAccountBalance)
);

/**
 * @route GET /api/v1/accounts/:id/transactions
 * @desc Get account transactions
 * @access Private
 */
router.get(
  '/:id/transactions',
  authMiddleware.authenticateJwt,
  validationMiddleware.validateRequest([
    param('id').isMongoId().withMessage('Invalid account ID format'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ]),
  wrapController(AccountController.getAccountTransactions)
);

/**
 * @route GET /api/v1/accounts/:id/stats
 * @desc Get account transaction statistics
 * @access Private
 */
router.get(
  '/:id/stats',
  authMiddleware.authenticateJwt,
  validationMiddleware.validateRequest([
    param('id').isMongoId().withMessage('Invalid account ID format')
  ]),
  performanceMiddleware.cacheResponse(300, 'account-stats'), // 5 minutes cache
  wrapController(AccountController.getAccountStats)
);

/**
 * @route POST /api/v1/accounts/:id/close
 * @desc Close an account
 * @access Private
 */
router.post(
  '/:id/close',
  authMiddleware.authenticateJwt,
  validationMiddleware.validateRequest([
    param('id').isMongoId().withMessage('Invalid account ID format'),
    body('reason').optional().isString().withMessage('Reason must be a string')
  ]),
  wrapController(AccountController.closeAccount)
);

/**
 * @route POST /api/v1/accounts/:id/reopen
 * @desc Reopen a closed account (admin only)
 * @access Private/Admin
 */
router.post(
  '/:id/reopen',
  authMiddleware.authenticateJwt,
  authMiddleware.hasRole(['admin']),
  validationMiddleware.validateRequest([
    param('id').isMongoId().withMessage('Invalid account ID format'),
    body('reason').optional().isString().withMessage('Reason must be a string')
  ]),
  wrapController(AccountController.reopenAccount)
);

export default router;