import { Request, Response, NextFunction } from 'express';
import { TransactionService, AccountService } from '../services';
import { AuthenticatedRequest } from '../types';
import { 
  BadRequestError, 
  NotFoundError, 
  ForbiddenError, 
  InsufficientFundsError 
} from '../utils/errors';
import { logger } from '../utils/logger';
import { performanceMiddleware, securityMiddleware } from '../middlewares';
import { 
  TransactionType, 
  TransactionStatus, 
  CurrencyCode,
  TransactionQueryParams
} from '../interfaces';

/**
 * Transaction Controller
 * Handles all financial transaction operations with comprehensive
 * validation, optimized performance, and proper error handling
 */
export class TransactionController {
  /**
   * Create a deposit transaction
   * @route POST /api/v1/transactions/deposit
   */
  async createDeposit(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      const depositData = {
        userId: req.user.id,
        accountNumber: req.body.accountNumber,
        amount: parseFloat(req.body.amount),
        currency: req.body.currency as CurrencyCode,
        description: req.body.description || 'Deposit transaction',
        reference: req.body.reference,
        metadata: req.body.metadata || {}
      };

      if (isNaN(depositData.amount) || depositData.amount <= 0) {
        throw new BadRequestError('Amount must be a positive number');
      }

      const transaction = await TransactionService.createDeposit(depositData);

      const cacheKeyPattern = `accounts:${req.user.id}:`;
      performanceMiddleware.flushCache(cacheKeyPattern);

      logger.info(`Deposit transaction completed: ${transaction.transactionId}`, {
        userId: req.user.id,
        accountNumber: depositData.accountNumber,
        amount: depositData.amount,
        currency: depositData.currency,
        transactionId: transaction.transactionId
      });

      res.status(201).json({
        success: true,
        message: 'Deposit completed successfully',
        data: transaction
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create a withdrawal transaction
   * @route POST /api/v1/transactions/withdrawal
   */
  async createWithdrawal(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      await new Promise<void>((resolve, reject) => {
        securityMiddleware.sensitiveRateLimiter(req, res, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      const withdrawalData = {
        userId: req.user.id,
        accountNumber: req.body.accountNumber,
        amount: parseFloat(req.body.amount),
        currency: req.body.currency as CurrencyCode,
        description: req.body.description || 'Withdrawal transaction',
        reference: req.body.reference,
        metadata: req.body.metadata || {}
      };

      if (isNaN(withdrawalData.amount) || withdrawalData.amount <= 0) {
        throw new BadRequestError('Amount must be a positive number');
      }

      const account = await AccountService.getAccountByNumber(withdrawalData.accountNumber);
      if (account.userId !== req.user.id) {
        throw new ForbiddenError('You can only withdraw from your own accounts');
      }

      const transaction = await TransactionService.createWithdrawal(withdrawalData);

      const cacheKeyPattern = `accounts:${req.user.id}:`;
      performanceMiddleware.flushCache(cacheKeyPattern);

      logger.info(`Withdrawal transaction completed: ${transaction.transactionId}`, {
        userId: req.user.id,
        accountNumber: withdrawalData.accountNumber,
        amount: withdrawalData.amount,
        currency: withdrawalData.currency,
        transactionId: transaction.transactionId
      });

      res.status(201).json({
        success: true,
        message: 'Withdrawal completed successfully',
        data: transaction
      });
    } catch (error) {
      if (error instanceof InsufficientFundsError) {
        return next(new BadRequestError('Insufficient funds for this withdrawal', {
          available: error.details?.available,
          requested: error.details?.requested
        }));
      }
      next(error);
    }
  }

  /**
   * Create a transfer transaction between accounts
   * @route POST /api/v1/transactions/transfer
   */
  async createTransfer(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      await new Promise<void>((resolve, reject) => {
        securityMiddleware.sensitiveRateLimiter(req, res, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      const transferData = {
        userId: req.user.id,
        fromAccountNumber: req.body.fromAccountNumber,
        toAccountNumber: req.body.toAccountNumber,
        amount: parseFloat(req.body.amount),
        currency: req.body.currency as CurrencyCode,
        description: req.body.description || 'Transfer transaction',
        reference: req.body.reference,
        metadata: req.body.metadata || {}
      };

      if (isNaN(transferData.amount) || transferData.amount <= 0) {
        throw new BadRequestError('Amount must be a positive number');
      }

      if (transferData.fromAccountNumber === transferData.toAccountNumber) {
        throw new BadRequestError('Source and destination accounts cannot be the same');
      }

      const sourceAccount = await AccountService.getAccountByNumber(transferData.fromAccountNumber);
      if (sourceAccount.userId !== req.user.id) {
        throw new ForbiddenError('You can only transfer from your own accounts');
      }

      const transaction = await TransactionService.createTransfer(transferData);

      const cacheKeyPattern = `accounts:${req.user.id}:`;
      performanceMiddleware.flushCache(cacheKeyPattern);

      logger.info(`Transfer transaction completed: ${transaction.transactionId}`, {
        userId: req.user.id,
        fromAccount: transferData.fromAccountNumber,
        toAccount: transferData.toAccountNumber,
        amount: transferData.amount,
        currency: transferData.currency,
        transactionId: transaction.transactionId
      });

      res.status(201).json({
        success: true,
        message: 'Transfer completed successfully',
        data: transaction
      });
    } catch (error) {
      if (error instanceof InsufficientFundsError) {
        return next(new BadRequestError('Insufficient funds for this transfer', {
          available: error.details?.available,
          requested: error.details?.requested
        }));
      }
      next(error);
    }
  }


  /**
   * Request a transaction reversal
   * @route POST /api/v1/transactions/:transactionId/reverse
   */
  async reverseTransaction(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }
      if ( req.user.role !== 'admin') {
        throw new ForbiddenError('You do not have permission to reverse this transaction');
      }
      const originalTransactionId = req.params.transactionId;
      
      const originalTransaction = await TransactionService.getTransactionByTransactionId(originalTransactionId);
      
      
      
      const transactionDate = new Date(originalTransaction.createdAt);
      const daysSinceTransaction = (Date.now() - transactionDate.getTime()) / (1000 * 60 * 60 * 24);
      
    

      const reversalData = {
        userId: req.user.id,
        originalTransactionId,
        reason: req.body.reason || 'User requested reversal',
        metadata: {
          requestedBy: req.user.id,
          requestedAt: new Date().toISOString(),
          originalDescription: originalTransaction.description,
          ...req.body.metadata || {}
        }
      };

      const transaction = await TransactionService.reverseTransaction(reversalData);

      const cacheKeyPattern = `accounts:${req.user.id}:`;
      performanceMiddleware.flushCache(cacheKeyPattern);

      logger.info(`Transaction reversal completed: ${transaction.transactionId}`, {
        userId: req.user.id,
        originalTransactionId,
        reversalTransactionId: transaction.transactionId,
        reason: reversalData.reason
      });

      res.status(201).json({
        success: true,
        message: 'Transaction reversed successfully',
        data: transaction
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get transaction by ID
   * @route GET /api/v1/transactions/:id
   */
  async getTransactionById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      const transactionId = req.params.id;
      
      const transaction = await TransactionService.getTransactionById(transactionId);
      
      if (transaction.userId !== req.user.id && req.user.role !== 'admin') {
        throw new ForbiddenError('You do not have permission to view this transaction');
      }

      res.status(200).json({
        success: true,
        data: transaction
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get transaction by transaction ID
   * @route GET /api/v1/transactions/reference/:transactionId
   */
  async getTransactionByTransactionId(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      const transactionId = req.params.transactionId;
      
      const transaction = await TransactionService.getTransactionByTransactionId(transactionId);
      
      if (transaction.userId !== req.user.id && req.user.role !== 'admin') {
        throw new ForbiddenError('You do not have permission to view this transaction');
      }

      res.status(200).json({
        success: true,
        data: transaction
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all user transactions with filtering and pagination
   * @route GET /api/v1/transactions
   */
  async getUserTransactions(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      const queryParams: TransactionQueryParams = {
        transactionType: req.query.type as TransactionType | undefined,
        status: req.query.status as TransactionStatus | undefined,
        fromDate: req.query.fromDate ? new Date(req.query.fromDate as string) : undefined,
        toDate: req.query.toDate ? new Date(req.query.toDate as string) : undefined,
        accountNumber: req.query.accountNumber as string | undefined,
        minAmount: req.query.minAmount ? parseFloat(req.query.minAmount as string) : undefined,
        maxAmount: req.query.maxAmount ? parseFloat(req.query.maxAmount as string) : undefined,
        page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 10,
        sortBy: req.query.sortBy as string || 'createdAt',
        sortDirection: (req.query.sortDirection as 'asc' | 'desc') || 'desc'
      };

      const shouldCache = !queryParams.accountNumber && 
                          !queryParams.fromDate && 
                          !queryParams.toDate &&
                          !queryParams.minAmount &&
                          !queryParams.maxAmount &&
                          !req.query.bypassCache;
                          
      const cacheKey = shouldCache ? 
        `transactions:${req.user.id}:${queryParams.page}:${queryParams.limit}:${queryParams.transactionType || 'all'}` : 
        null;
      
      if (cacheKey) {
        const cachedData = performanceMiddleware.getCache().get(cacheKey);
        if (cachedData) {
          res.setHeader('X-Cache', 'HIT');
          res.status(200).json(cachedData);
        }
      }

      const { transactions, total } = await TransactionService.getUserTransactions(
        req.user.id,
        queryParams
      );

      const responseData = {
        success: true,
        data: transactions,
        pagination: {
          total,
          page: queryParams.page,
          limit: queryParams.limit,
          pages: Math.ceil(total / (queryParams.limit || 10))
        }
      };

      if (cacheKey) {
        performanceMiddleware.getCache().set(cacheKey, responseData, 30); 
        res.setHeader('X-Cache', 'MISS');
      }

      res.status(200).json(responseData);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user transaction statistics
   * @route GET /api/v1/transactions/stats
   */
  async getUserTransactionStats(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

      const shouldCache = !startDate && !endDate && !req.query.bypassCache;
      const cacheKey = shouldCache ? `transactions:stats:${req.user.id}` : null;
      
      if (cacheKey) {
        const cachedData = performanceMiddleware.getCache().get(cacheKey);
        if (cachedData) {
          res.setHeader('X-Cache', 'HIT');
          res.status(200).json(cachedData);
        }
      }

      const stats = await TransactionService.getUserTransactionStats(
        req.user.id,
        startDate,
        endDate
      );

      const responseData = {
        success: true,
        data: stats
      };

      if (cacheKey) {
        performanceMiddleware.getCache().set(cacheKey, responseData, 300); 
        res.setHeader('X-Cache', 'MISS');
      }

      res.status(200).json(responseData);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Process pending transactions (admin only)
   * @route POST /api/v1/transactions/process-pending
   * @access Admin only
   */
  async processPendingTransactions(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      if (req.user.role !== 'admin') {
        throw new ForbiddenError('Only administrators can process pending transactions');
      }

      const result = await TransactionService.processPendingTransactions();

      logger.info(`Processed pending transactions`, {
        adminId: req.user.id,
        processed: result.processed,
        failed: result.failed
      });

      res.status(200).json({
        success: true,
        message: `Processed ${result.processed} transactions successfully, ${result.failed} failed`,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verify a transaction
   * @route GET /api/v1/transactions/verify/:transactionId
   * @description Public endpoint to verify transaction authenticity
   */
  async verifyTransaction(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const transactionId = req.params.transactionId;
      
      await new Promise<void>((resolve, reject) => {
        securityMiddleware.generalRateLimiter(req, res, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
      
      try {
        const transaction = await TransactionService.getTransactionByTransactionId(transactionId);
        
        res.status(200).json({
          success: true,
          verified: true,
          data: {
            transactionId: transaction.transactionId,
            transactionType: transaction.transactionType,
            amount: transaction.amount,
            currency: transaction.currency,
            status: transaction.status,
            timestamp: transaction.createdAt
          }
        });
      } catch (error) {
        if (error instanceof NotFoundError) {
          res.status(200).json({
            success: true,
            verified: false,
            message: 'Transaction not found or invalid'
          });
        }
        throw error;
      }
    } catch (error) {
      next(error);
    }
  }
}

export default new TransactionController();