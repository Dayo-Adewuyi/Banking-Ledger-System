import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { TransactionController } from '../controllers';
import { 
  authMiddleware, 
  validationMiddleware, 
  securityMiddleware,
  performanceMiddleware 
} from '../middlewares';
import { 
  TransactionType, 
  TransactionStatus,
  CurrencyCode
} from '../interfaces';
import { wrapController } from '../utils';

const router = Router();

/**
 * Transaction Routes
 * Routes for financial transactions including deposits, withdrawals,
 * transfers, payments, and transaction history
 */

const transactionValidation = validationMiddleware.transactionValidation;

/**
 * @route POST /api/v1/transactions/deposit
 * @desc Create a deposit transaction
 * @access Private
 */
router.post(
  '/deposit',
  authMiddleware.authenticateJwt,
  transactionValidation.deposit,
 wrapController(TransactionController.createDeposit)
);

/**
 * @route POST /api/v1/transactions/withdrawal
 * @desc Create a withdrawal transaction
 * @access Private
 */
router.post(
  '/withdrawal',
  authMiddleware.authenticateJwt,
  securityMiddleware.sensitiveRateLimiter,
  transactionValidation.withdrawal,
    wrapController(TransactionController.createWithdrawal)
);

/**
 * @route POST /api/v1/transactions/transfer
 * @desc Create a transfer transaction between accounts
 * @access Private
 */
router.post(
  '/transfer',
  authMiddleware.authenticateJwt,
  securityMiddleware.sensitiveRateLimiter,
  transactionValidation.transfer,
    wrapController(TransactionController.createTransfer)
);



/**
 * @route POST /api/v1/transactions/:transactionId/reverse
 * @desc Request a transaction reversal
 * @access Private
 */
router.post(
  '/:transactionId/reverse',
  authMiddleware.authenticateJwt,
  authMiddleware.hasRole(['admin']),
  securityMiddleware.sensitiveRateLimiter,
  validationMiddleware.validateRequest([
    param('transactionId').notEmpty().withMessage('Transaction ID is required'),
    body('reason').notEmpty().withMessage('Reason for reversal is required')
  ]),
  wrapController(TransactionController.reverseTransaction)
);

/**
 * @route GET /api/v1/transactions
 * @desc Get all user transactions with filtering and pagination
 * @access Private
 */
router.get(
  '/',
  authMiddleware.authenticateJwt,
  validationMiddleware.validateRequest([
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('type').optional().isIn(Object.values(TransactionType))
      .withMessage('Invalid transaction type'),
    query('status').optional().isIn(Object.values(TransactionStatus))
      .withMessage('Invalid transaction status')
  ]),
  performanceMiddleware.cacheResponse(10, 'user-transactions'),
  wrapController(TransactionController.getUserTransactions)
);

/**
 * @route GET /api/v1/transactions/stats
 * @desc Get user transaction statistics
 * @access Private
 */
router.get(
  '/stats',
  authMiddleware.authenticateJwt,
  performanceMiddleware.cacheResponse(300, 'transaction-stats'), // 5 minute cache
  wrapController(TransactionController.getUserTransactionStats)
);

/**
 * @route GET /api/v1/transactions/:id
 * @desc Get transaction by ID
 * @access Private
 */
router.get(
  '/:id',
  authMiddleware.authenticateJwt,
  validationMiddleware.validateRequest([
    param('id').isMongoId().withMessage('Invalid transaction ID format')
  ]),
 wrapController(
    TransactionController.getTransactionById
  )
);

/**
 * @route GET /api/v1/transactions/reference/:transactionId
 * @desc Get transaction by transaction ID
 * @access Private
 */
router.get(
  '/reference/:transactionId',
  authMiddleware.authenticateJwt,
  validationMiddleware.validateRequest([
    param('transactionId').notEmpty().withMessage('Transaction ID is required')
  ]),
  wrapController(TransactionController.getTransactionByTransactionId)
);

/**
 * @route GET /api/v1/transactions/verify/:transactionId
 * @desc Verify a transaction (public endpoint)
 * @access Public
 */
router.get(
  '/verify/:transactionId',
  securityMiddleware.generalRateLimiter,
  validationMiddleware.validateRequest([
    param('transactionId').notEmpty().withMessage('Transaction ID is required')
  ]),
  TransactionController.verifyTransaction
);

/**
 * @route POST /api/v1/transactions/process-pending
 * @desc Process pending transactions (admin only)
 * @access Private/Admin
 */
router.post(
  '/process-pending',
  authMiddleware.authenticateJwt,
  authMiddleware.hasRole(['admin']),
  wrapController(TransactionController.processPendingTransactions)
);

export default router;