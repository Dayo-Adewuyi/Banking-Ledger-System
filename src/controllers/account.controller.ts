import { Request, Response, NextFunction } from 'express';
import { AccountService, TransactionService } from '../services';
import { AuthenticatedRequest } from '../types';
import { 
  BadRequestError,  
  ForbiddenError 
} from '../utils/errors';
import { logger } from '../utils/logger';
import { performanceMiddleware } from '../middlewares';
import { AccountQueryParams, AccountType, CurrencyCode, TransactionType, TransactionStatus } from '../interfaces';


/**
 * Account Controller
 * Handles all account management operations with performance optimizations
 * and comprehensive error handling
 */
export class AccountController {
  /**
   * Create a new account for the authenticated user
   * @route POST /api/v1/accounts
   */
  async createAccount(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      const accountData = {
        userId: req.user.id,
        accountType: req.body.accountType as AccountType,
        currency: req.body.currency as CurrencyCode,
        initialBalance: req.body.initialBalance || 0,
        metadata: req.body.metadata || {}
      };

      if (req.body.name) {
        accountData.metadata = {
          ...accountData.metadata,
          name: req.body.name
        };
      }

      const account = await AccountService.createAccount(accountData);

      logger.info(`Account created: ${account.id}`, {
        userId: req.user.id,
        accountId: account.id,
        accountType: accountData.accountType,
        currency: accountData.currency
      });

      res.status(201).json({
        success: true,
        message: 'Account created successfully',
        data: account
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all accounts for the authenticated user
   * @route GET /api/v1/accounts
   */
  async getUserAccounts(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      const queryParams: AccountQueryParams = {
        accountType: req.query.accountType as AccountType | undefined,
        currency: req.query.currency as CurrencyCode | undefined,
        isActive: req.query.isActive === 'true',
        page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 10,
        sortBy: req.query.sortBy as string || 'createdAt',
        sortDirection: (req.query.sortDirection as 'asc' | 'desc') || 'desc'
      };

      const cacheKey = `accounts:${req.user.id}:${JSON.stringify(queryParams)}`;
      
      const cachedData = performanceMiddleware.getCache().get(cacheKey);
      if (cachedData && !req.query.bypassCache) {
        res.setHeader('X-Cache', 'HIT');
        res.status(200).json(cachedData);
      }

      const { accounts, total } = await AccountService.getUserAccounts(
        req.user.id,
        queryParams.page,
        queryParams.limit
      );

      const responseData = {
        success: true,
        data: accounts,
        pagination: {
          total,
          page: queryParams.page,
          limit: queryParams.limit,
          pages: Math.ceil(total / (queryParams.limit || 1))
        }
      };

      performanceMiddleware.getCache().set(cacheKey, responseData, 60);
      res.setHeader('X-Cache', 'MISS');

      res.status(200).json(responseData);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get account by ID
   * @route GET /api/v1/accounts/:id
   */
  async getAccountById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      const accountId = req.params.id;
      const account = await AccountService.getAccountById(accountId);

      if (account.userId !== req.user.id && req.user.role !== 'admin') {
        throw new ForbiddenError('You do not have permission to access this account');
      }

      res.status(200).json({
        success: true,
        data: account
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get account by account number
   * @route GET /api/v1/accounts/number/:accountNumber
   */
  async getAccountByNumber(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      const accountNumber = req.params.accountNumber;
      const account = await AccountService.getAccountByNumber(accountNumber);

      if (account.userId !== req.user.id && req.user.role !== 'admin') {
        throw new ForbiddenError('You do not have permission to access this account');
      }

      res.status(200).json({
        success: true,
        data: account
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update account details
   * @route PATCH /api/v1/accounts/:id
   */
  async updateAccount(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      const accountId = req.params.id;
      
      const account = await AccountService.getAccountById(accountId);
      
      if (account.userId !== req.user.id && req.user.role !== 'admin') {
        throw new ForbiddenError('You do not have permission to update this account');
      }

      const updateData = {
        accountType: req.body.accountType as AccountType | undefined,
        isActive: req.body.isActive as boolean | undefined,
        metadata: req.body.metadata as Record<string, any> | undefined
      };

      if (req.body.name) {
        updateData.metadata = {
          ...(updateData.metadata || {}),
          name: req.body.name
        };
      }

      const updatedAccount = await AccountService.updateAccount(accountId, updateData);

      const cacheKeyPattern = `accounts:${req.user.id}:`;
      performanceMiddleware.flushCache(cacheKeyPattern);

      logger.info(`Account updated: ${accountId}`, {
        userId: req.user.id,
        accountId,
        updates: Object.keys(updateData)
      });

      res.status(200).json({
        success: true,
        message: 'Account updated successfully',
        data: updatedAccount
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get account balance
   * @route GET /api/v1/accounts/:id/balance
   */
  async getAccountBalance(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      const accountId = req.params.id;
      
      const account = await AccountService.getAccountById(accountId);
      
      if (account.userId !== req.user.id && req.user.role !== 'admin') {
        throw new ForbiddenError('You do not have permission to access this account');
      }

      res.status(200).json({
        success: true,
        data: {
          accountId: account.id,
          accountNumber: account.accountNumber,
          balance: account.balance,
          currency: account.currency,
          availableBalance: account.balance 
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get account transactions
   * @route GET /api/v1/accounts/:id/transactions
   */
  async getAccountTransactions(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      const accountId = req.params.id;
      
      const account = await AccountService.getAccountById(accountId);
      
      if (account.userId !== req.user.id && req.user.role !== 'admin') {
        throw new ForbiddenError('You do not have permission to access this account');
      }

     
      const queryParams = {
        transactionType: req.query.transactionType as TransactionType | undefined,
        status: req.query.status as TransactionStatus | undefined,
        fromDate: req.query.fromDate ? new Date(req.query.fromDate as string) : undefined,
        toDate: req.query.toDate ? new Date(req.query.toDate as string) : undefined,
        minAmount: req.query.minAmount ? parseFloat(req.query.minAmount as string) : undefined,
        maxAmount: req.query.maxAmount ? parseFloat(req.query.maxAmount as string) : undefined,
        page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 10,
        sortBy: req.query.sortBy as string || 'createdAt',
        sortDirection: (req.query.sortDirection as 'asc' | 'desc') || 'desc'
      };

      const { transactions, total } = await TransactionService.getAccountTransactions(
        accountId,
        queryParams
      );

      res.status(200).json({
        success: true,
        data: transactions,
        pagination: {
          total,
          page: queryParams.page,
          limit: queryParams.limit,
          pages: Math.ceil(total / queryParams.limit)
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get account transaction statistics
   * @route GET /api/v1/accounts/:id/stats
   */
  async getAccountStats(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      const accountId = req.params.id;
      
      const account = await AccountService.getAccountById(accountId);
      
      if (account.userId !== req.user.id && req.user.role !== 'admin') {
        throw new ForbiddenError('You do not have permission to access this account');
      }

      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

      const stats = await TransactionService.getAccountTransactionStats(
        accountId,
        startDate,
        endDate
      );

      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Close an account
   * @route POST /api/v1/accounts/:id/close
   */
  async closeAccount(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      const accountId = req.params.id;
      
      const account = await AccountService.getAccountById(accountId);
      
      if (account.userId !== req.user.id && req.user.role !== 'admin') {
        throw new ForbiddenError('You do not have permission to close this account');
      }

      if (parseFloat(account.balance) > 0) {
        throw new BadRequestError(
          'Account cannot be closed with a positive balance. Please transfer or withdraw all funds first.'
        );
      }

      const updateData = {
        isActive: false,
        metadata: {
          ...account.metadata,
          closedAt: new Date().toISOString(),
          closedBy: req.user.id,
          closureReason: req.body.reason || 'User requested closure'
        }
      };

      await AccountService.updateAccount(accountId, updateData);

      const cacheKeyPattern = `accounts:${req.user.id}:`;
      performanceMiddleware.flushCache(cacheKeyPattern);

      logger.info(`Account closed: ${accountId}`, {
        userId: req.user.id,
        accountId,
        reason: req.body.reason || 'User requested closure'
      });

      res.status(200).json({
        success: true,
        message: 'Account closed successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reopen a closed account
   * @route POST /api/v1/accounts/:id/reopen
   * @access Admin only
   */
  async reopenAccount(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      if (req.user.role !== 'admin') {
        throw new ForbiddenError('Only administrators can reopen accounts');
      }

      const accountId = req.params.id;
      
      const account = await AccountService.getAccountById(accountId);
      
      if (account.isActive) {
        throw new BadRequestError('Account is already active');
      }

      const updateData = {
        isActive: true,
        metadata: {
          ...account.metadata,
          reopenedAt: new Date().toISOString(),
          reopenedBy: req.user.id,
          reopenReason: req.body.reason || 'Administrative action'
        }
      };

      const updatedAccount = await AccountService.updateAccount(accountId, updateData);

      const cacheKeyPattern = `accounts:${account.userId}:`;
      performanceMiddleware.flushCache(cacheKeyPattern);

      logger.info(`Account reopened: ${accountId}`, {
        adminId: req.user.id,
        accountId,
        userId: account.userId,
        reason: req.body.reason || 'Administrative action'
      });

      res.status(200).json({
        success: true,
        message: 'Account reopened successfully',
        data: updatedAccount
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get account summary (overview of all user accounts)
   * @route GET /api/v1/accounts/summary
   */
  async getAccountsSummary(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      const cacheKey = `accounts:summary:${req.user.id}`;
      const cachedData = performanceMiddleware.getCache().get(cacheKey);
      
      if (cachedData && !req.query.bypassCache) {
        res.setHeader('X-Cache', 'HIT');
        res.status(200).json(cachedData);
      }

      const { accounts } = await AccountService.getUserAccounts(req.user.id, 1, 100);
      
      const summary = {
        totalAccounts: accounts.length,
        activeAccounts: accounts.filter(acc => acc.isActive).length,
        totalBalance: {} as Record<string, string>,
        accountsByType: {} as Record<string, number>,
        accountsByCurrency: {} as Record<string, number>
      };

      accounts.forEach(account => {
        const currency = account.currency;
        if (!summary.totalBalance[currency]) {
          summary.totalBalance[currency] = '0';
        }
        
        summary.totalBalance[currency] = (
          parseFloat(summary.totalBalance[currency]) + 
          parseFloat(account.balance)
        ).toFixed(2);

        const accountType = account.accountType;
        summary.accountsByType[accountType] = (summary.accountsByType[accountType] || 0) + 1;

        summary.accountsByCurrency[currency] = (summary.accountsByCurrency[currency] || 0) + 1;
      });

      const responseData = {
        success: true,
        data: {
          summary,
          accounts: accounts.map(acc => ({
            id: acc.id,
            accountNumber: acc.accountNumber,
            accountType: acc.accountType,
            currency: acc.currency,
            balance: acc.balance,
            isActive: acc.isActive,
            name: acc.metadata?.name || 'Account' 
          }))
        }
      };

      performanceMiddleware.getCache().set(cacheKey, responseData, 60);
      res.setHeader('X-Cache', 'MISS');

      res.status(200).json(responseData);
    } catch (error) {
      next(error);
    }
  }
}

export default new AccountController();