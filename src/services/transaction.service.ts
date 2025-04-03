import mongoose, {PipelineStage} from 'mongoose';
import Transaction from '../models/transaction.model';
import Account from '../models/account.model';
import AccountBalance from '../models/accountBalance.model';
import {
  ITransaction,
  TransactionType,
  TransactionStatus,
  EntryType,
  DepositTransactionDTO,
  WithdrawalTransactionDTO,
  TransferTransactionDTO,
  PaymentTransactionDTO,
  FeeTransactionDTO,
  ReversalTransactionDTO,
  TransactionResponseDTO,
  TransactionDetailedResponseDTO,
  TransactionQueryParams
} from '../interfaces/transaction.interface';
import { CurrencyCode } from '../interfaces/account.interface';
import {
  BadRequestError,
  NotFoundError,
  InsufficientFundsError,
  DatabaseError,
  TransactionError
} from '../utils/errors';
import { generateTransactionId } from '../utils/crypto';
import { Decimal } from 'decimal.js';
import { logger } from '../utils/logger';

/**
 * Service for handling all transaction-related operations with
 * optimized performance and strict data integrity
 */
 class TransactionService {
  private readonly TRANSACTION_CACHE_TTL = 300;

  private systemAccounts: Record<string, string> = {};


  /**
   * Get or create a system account for a specific purpose
   * @param accountType The type of system account
   * @param currency The currency for the system account
   * @returns System account ID
   */
  private async getSystemAccount(accountType: string, currency: CurrencyCode): Promise<string> {
    const cacheKey = `${accountType}_${currency}`;
    
    if (this.systemAccounts[cacheKey]) {
      return this.systemAccounts[cacheKey];
    }
    
    const systemAccount = await Account.findOne({
      accountType: 'SYSTEM',
      currency,
      'metadata.purpose': accountType
    });
    
    if (systemAccount) {
      this.systemAccounts[cacheKey] = systemAccount._id.toString();
      return systemAccount._id.toString();
    }
    
    const systemUserId = await this.getSystemUserId();
    
    const newSystemAccount = new Account({
      userId: systemUserId,
      accountNumber: generateTransactionId('SYS'),
      accountType: 'SYSTEM',
      currency,
      isActive: true,
      metadata: new Map([
        ['purpose', accountType],
        ['description', `System ${accountType} Account for ${currency}`],
        ['createdAt', new Date().toISOString()]
      ])
    });
    
    await newSystemAccount.save();
    
    const systemBalance = new AccountBalance({
      accountId: newSystemAccount._id,
      currency,
      balance: '0',
      lastUpdated: new Date()
    });
    
    await systemBalance.save();
    
    this.systemAccounts[cacheKey] = newSystemAccount._id.toString();
    return newSystemAccount._id.toString();
  }
  
  /**
   * Get system user ID for system accounts
   * @returns System user ID
   */
  private async getSystemUserId(): Promise<string> {

    return "000000000000000000000001";
  }

  /**
   * Create a deposit transaction
   * @param depositData Deposit transaction data
   * @returns Created transaction
   */
  async createDeposit(depositData: DepositTransactionDTO): Promise<TransactionResponseDTO> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const account = await Account.findOne({ 
        accountNumber: depositData.accountNumber,
        isActive: true 
      }).session(session);

      if (!account) {
        throw new NotFoundError('Account not found or inactive');
      }

      if (account.currency !== depositData.currency) {
        throw new BadRequestError(
          `Currency mismatch. Account is in ${account.currency}, but deposit is in ${depositData.currency}`
        );
      }

      const accountBalance = await AccountBalance.findOne({ 
        accountId: account._id 
      }).session(session);

      if (!accountBalance) {
        throw new NotFoundError('Account balance not found');
      }

      const transactionId = generateTransactionId('DEP');
      const depositsAccountId = await this.getSystemAccount('DEPOSITS', depositData.currency);

      const entries = [
        {
          accountId: account._id,
          entryType: EntryType.CREDIT,
          amount: depositData.amount.toString()
        },
        {
          accountId: new mongoose.Types.ObjectId(depositsAccountId),
          entryType: EntryType.DEBIT,
          amount: depositData.amount.toString()
        }
      ];

      const transaction = new Transaction({
        transactionId,
        transactionType: TransactionType.DEPOSIT,
        userId: new mongoose.Types.ObjectId(depositData.userId),
        entries,
        amount: depositData.amount.toString(),
        currency: depositData.currency,
        toAccount: account.accountNumber,
        status: TransactionStatus.PROCESSING,
        description: depositData.description || 'Deposit transaction',
        reference: depositData.reference || transactionId,
        metadata: depositData.metadata ? new Map(Object.entries(depositData.metadata)) : new Map()
      });

      await transaction.save({ session });

      const currentBalance = new Decimal(accountBalance.balance.toString());
      const newBalance = currentBalance.plus(depositData.amount);

      accountBalance.balance = mongoose.Types.Decimal128.fromString(newBalance.toString());
      accountBalance.lastUpdated = new Date();

      await accountBalance.save({ session });

      transaction.status = TransactionStatus.COMPLETED;
      transaction.processedAt = new Date();
      await transaction.save({ session });

      await session.commitTransaction();
      session.endSession();

      logger.info(`Deposit transaction completed: ${transactionId}`, {
        transactionId,
        userId: depositData.userId,
        accountNumber: depositData.accountNumber,
        amount: depositData.amount,
        currency: depositData.currency
      });

      return this.mapTransactionToDTO(transaction);
    } catch (error) {
      await session.abortTransaction();
      session.endSession();

      if (error instanceof mongoose.Error.ValidationError) {
        throw new BadRequestError('Invalid transaction data', error);
      }

      throw error;
    }
  }

  /**
   * Create a withdrawal transaction
   * @param withdrawalData Withdrawal transaction data
   * @returns Created transaction
   */
  async createWithdrawal(withdrawalData: WithdrawalTransactionDTO): Promise<TransactionResponseDTO> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const account = await Account.findOne({ 
        accountNumber: withdrawalData.accountNumber,
        isActive: true 
      }).session(session);

      if (!account) {
        throw new NotFoundError('Account not found or inactive');
      }

      if (account.currency !== withdrawalData.currency) {
        throw new BadRequestError(
          `Currency mismatch. Account is in ${account.currency}, but withdrawal is in ${withdrawalData.currency}`
        );
      }

      const accountBalance = await AccountBalance.findOne({ 
        accountId: account._id 
      }).session(session);

      if (!accountBalance) {
        throw new NotFoundError('Account balance not found');
      }

      const currentBalance = new Decimal(accountBalance.balance.toString());
      if (currentBalance.lessThan(withdrawalData.amount)) {
        throw new InsufficientFundsError('Insufficient funds for withdrawal', {
          available: currentBalance.toString(),
          requested: withdrawalData.amount.toString()
        });
      }

      const transactionId = generateTransactionId('WDR');
      const withdrawalsAccountId = await this.getSystemAccount('WITHDRAWALS', withdrawalData.currency);
      const entries = [
        {
          accountId: account._id,
          entryType: EntryType.DEBIT,
          amount: withdrawalData.amount.toString()
        },
        {
          accountId: new mongoose.Types.ObjectId(withdrawalsAccountId),
          entryType: EntryType.CREDIT,
          amount: withdrawalData.amount.toString()
        }
      ];

      const transaction = new Transaction({
        transactionId,
        transactionType: TransactionType.WITHDRAWAL,
        userId: new mongoose.Types.ObjectId(withdrawalData.userId),
        entries,
        amount: withdrawalData.amount.toString(),
        currency: withdrawalData.currency,
        fromAccount: account.accountNumber,
        status: TransactionStatus.PROCESSING,
        description: withdrawalData.description || 'Withdrawal transaction',
        reference: withdrawalData.reference || transactionId,
        metadata: withdrawalData.metadata ? new Map(Object.entries(withdrawalData.metadata)) : new Map()
      });

      await transaction.save({ session });

      const newBalance = currentBalance.minus(withdrawalData.amount);
      accountBalance.balance = mongoose.Types.Decimal128.fromString(newBalance.toString());
      accountBalance.lastUpdated = new Date();

      await accountBalance.save({ session });

      transaction.status = TransactionStatus.COMPLETED;
      transaction.processedAt = new Date();
      await transaction.save({ session });

      await session.commitTransaction();
      session.endSession();

      logger.info(`Withdrawal transaction completed: ${transactionId}`, {
        transactionId,
        userId: withdrawalData.userId,
        accountNumber: withdrawalData.accountNumber,
        amount: withdrawalData.amount,
        currency: withdrawalData.currency
      });

      return this.mapTransactionToDTO(transaction);
    } catch (error) {
      await session.abortTransaction();
      session.endSession();

      if (error instanceof mongoose.Error.ValidationError) {
        throw new BadRequestError('Invalid transaction data', error);
      }

      throw error;
    }
  }

  /**
   * Create a transfer transaction between accounts
   * @param transferData Transfer transaction data
   * @returns Created transaction
   */
  async createTransfer(transferData: TransferTransactionDTO): Promise<TransactionResponseDTO> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      if (transferData.fromAccountNumber === transferData.toAccountNumber) {
        throw new BadRequestError('Source and destination accounts cannot be the same');
      }

      const sourceAccount = await Account.findOne({ 
        accountNumber: transferData.fromAccountNumber,
        isActive: true 
      }).session(session);

      if (!sourceAccount) {
        throw new NotFoundError('Source account not found or inactive');
      }

      const destinationAccount = await Account.findOne({ 
        accountNumber: transferData.toAccountNumber,
        isActive: true 
      }).session(session);

      if (!destinationAccount) {
        throw new NotFoundError('Destination account not found or inactive');
      }

      if (sourceAccount.currency !== transferData.currency) {
        throw new BadRequestError(
          `Currency mismatch. Source account is in ${sourceAccount.currency}, but transfer is in ${transferData.currency}`
        );
      }

      if (destinationAccount.currency !== transferData.currency) {
        throw new BadRequestError(
          `Currency mismatch. Destination account is in ${destinationAccount.currency}, but transfer is in ${transferData.currency}`
        );
      }

      if (sourceAccount.userId.toString() !== transferData.userId) {
        throw new BadRequestError('You can only transfer from your own accounts');
      }

      const sourceBalance = await AccountBalance.findOne({ 
        accountId: sourceAccount._id 
      }).session(session);

      if (!sourceBalance) {
        throw new NotFoundError('Source account balance not found');
      }

      const destinationBalance = await AccountBalance.findOne({ 
        accountId: destinationAccount._id 
      }).session(session);

      if (!destinationBalance) {
        throw new NotFoundError('Destination account balance not found');
      }

      const currentSourceBalance = new Decimal(sourceBalance.balance.toString());
      if (currentSourceBalance.lessThan(transferData.amount)) {
        throw new InsufficientFundsError('Insufficient funds for transfer', {
          available: currentSourceBalance.toString(),
          requested: transferData.amount.toString()
        });
      }

      const transactionId = generateTransactionId('TRF');

      const entries = [
        {
          accountId: sourceAccount._id,
          entryType: EntryType.DEBIT,
          amount: transferData.amount.toString()
        },
        {
          accountId: destinationAccount._id,
          entryType: EntryType.CREDIT,
          amount: transferData.amount.toString()
        }
      ];

      const transaction = new Transaction({
        transactionId,
        transactionType: TransactionType.TRANSFER,
        userId: new mongoose.Types.ObjectId(transferData.userId),
        entries,
        amount: transferData.amount.toString(),
        currency: transferData.currency,
        fromAccount: sourceAccount.accountNumber,
        toAccount: destinationAccount.accountNumber,
        status: TransactionStatus.PROCESSING,
        description: transferData.description || 'Transfer transaction',
        reference: transferData.reference || transactionId,
        metadata: transferData.metadata ? new Map(Object.entries(transferData.metadata)) : new Map()
      });

      await transaction.save({ session });

      const newSourceBalance = currentSourceBalance.minus(transferData.amount);
      sourceBalance.balance = mongoose.Types.Decimal128.fromString(newSourceBalance.toString());
      sourceBalance.lastUpdated = new Date();
      await sourceBalance.save({ session });

      const currentDestBalance = new Decimal(destinationBalance.balance.toString());
      const newDestBalance = currentDestBalance.plus(transferData.amount);
      destinationBalance.balance = mongoose.Types.Decimal128.fromString(newDestBalance.toString());
      destinationBalance.lastUpdated = new Date();
      await destinationBalance.save({ session });

      transaction.status = TransactionStatus.COMPLETED;
      transaction.processedAt = new Date();
      await transaction.save({ session });

      await session.commitTransaction();
      session.endSession();

      logger.info(`Transfer transaction completed: ${transactionId}`, {
        transactionId,
        userId: transferData.userId,
        fromAccount: transferData.fromAccountNumber,
        toAccount: transferData.toAccountNumber,
        amount: transferData.amount,
        currency: transferData.currency
      });

      return this.mapTransactionToDTO(transaction);
    } catch (error) {
      await session.abortTransaction();
      session.endSession();

      if (error instanceof mongoose.Error.ValidationError) {
        throw new BadRequestError('Invalid transaction data', error);
      }

      throw error;
    }
  }



  /**
   * Create a fee transaction (system charges)
   * @param feeData Fee transaction data
   * @returns Created transaction
   */
  async createFee(feeData: FeeTransactionDTO): Promise<TransactionResponseDTO> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const account = await Account.findOne({ 
        accountNumber: feeData.accountNumber,
        isActive: true 
      }).session(session);

      if (!account) {
        throw new NotFoundError('Account not found or inactive');
      }

      if (account.currency !== feeData.currency) {
        throw new BadRequestError(
          `Currency mismatch. Account is in ${account.currency}, but fee is in ${feeData.currency}`
        );
      }

      const accountBalance = await AccountBalance.findOne({ 
        accountId: account._id 
      }).session(session);

      if (!accountBalance) {
        throw new NotFoundError('Account balance not found');
      }

      const currentBalance = new Decimal(accountBalance.balance.toString());
      if (currentBalance.lessThan(feeData.amount)) {
        throw new InsufficientFundsError('Insufficient funds for fee deduction', {
          available: currentBalance.toString(),
          requested: feeData.amount.toString()
        });
      }

      const transactionId = generateTransactionId('FEE');
      const feesAccountId = await this.getSystemAccount('FEES', feeData.currency);

      const entries = [
        {
          accountId: account._id,
          entryType: EntryType.DEBIT,
          amount: feeData.amount.toString()
        },
        {
          accountId: new mongoose.Types.ObjectId(feesAccountId),
          entryType: EntryType.CREDIT,
          amount: feeData.amount.toString()
        }
      ];

      const transaction = new Transaction({
        transactionId,
        transactionType: TransactionType.FEE,
        userId: new mongoose.Types.ObjectId(feeData.userId),
        entries,
        amount: feeData.amount.toString(),
        currency: feeData.currency,
        fromAccount: account.accountNumber,
        status: TransactionStatus.PROCESSING,
        description: feeData.description || 'Fee transaction',
        reference: feeData.reference || transactionId,
        metadata: feeData.metadata ? new Map(Object.entries(feeData.metadata)) : new Map()
      });

      await transaction.save({ session });

      const newBalance = currentBalance.minus(feeData.amount);
      accountBalance.balance = mongoose.Types.Decimal128.fromString(newBalance.toString());
      accountBalance.lastUpdated = new Date();

      await accountBalance.save({ session });

      transaction.status = TransactionStatus.COMPLETED;
      transaction.processedAt = new Date();
      await transaction.save({ session });

      await session.commitTransaction();
      session.endSession();

      logger.info(`Fee transaction completed: ${transactionId}`, {
        transactionId,
        userId: feeData.userId,
        accountNumber: feeData.accountNumber,
        amount: feeData.amount,
        currency: feeData.currency
      });

      return this.mapTransactionToDTO(transaction);
    } catch (error) {
      await session.abortTransaction();
      session.endSession();

      if (error instanceof mongoose.Error.ValidationError) {
        throw new BadRequestError('Invalid transaction data', error);
      }

      throw error;
    }
  }

  /**
   * Reverse a transaction
   * @param reversalData Reversal transaction data
   * @returns Created reversal transaction
   */
  async reverseTransaction(reversalData: ReversalTransactionDTO): Promise<TransactionResponseDTO> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const originalTransaction = await Transaction.findOne({ 
        transactionId: reversalData.originalTransactionId,
        status: TransactionStatus.COMPLETED
      }).session(session);

      if (!originalTransaction) {
        throw new NotFoundError('Original transaction not found or not in completed state');
      }

      const existingReversal = await Transaction.findOne({
        'metadata.originalTransactionId': reversalData.originalTransactionId,
        transactionType: TransactionType.REVERSAL
      }).session(session);

      if (existingReversal) {
        throw new BadRequestError('Transaction has already been reversed', {
          reversalId: existingReversal.transactionId
        });
      }

      const transactionId = generateTransactionId('REV');
      
      const reversedEntries = originalTransaction.entries.map(entry => ({
        accountId: entry.accountId,
        entryType: entry.entryType === EntryType.DEBIT ? EntryType.CREDIT : EntryType.DEBIT,
        amount: entry.amount.toString()
      }));

      const reversalTransaction = new Transaction({
        transactionId,
        transactionType: TransactionType.REVERSAL,
        userId: new mongoose.Types.ObjectId(reversalData.userId),
        entries: reversedEntries,
        amount: originalTransaction.amount,
        currency: originalTransaction.currency,
        fromAccount: originalTransaction.toAccount, 
        toAccount: originalTransaction.fromAccount,
        status: TransactionStatus.PROCESSING,
        description: `Reversal: ${reversalData.reason} (Original: ${originalTransaction.transactionId})`,
        reference: reversalData.originalTransactionId,
        metadata: new Map([
          ...Object.entries(reversalData.metadata || {}),
          ['originalTransactionId', originalTransaction.transactionId],
          ['reversalReason', reversalData.reason]
        ])
      });

      await reversalTransaction.save({ session });

      for (const entry of reversedEntries) {
        const accountBalance = await AccountBalance.findOne({ 
          accountId: entry.accountId 
        }).session(session);

        if (!accountBalance) {
          throw new NotFoundError(`Account balance not found for account ID: ${entry.accountId}`);
        }

        const currentBalance = new Decimal(accountBalance.balance.toString());
        const entryAmount = new Decimal(entry.amount.toString());
        let newBalance;

        if (entry.entryType === EntryType.CREDIT) {
          newBalance = currentBalance.plus(entryAmount);
        } else {
          newBalance = currentBalance.minus(entryAmount);
          
          if (newBalance.isNegative()) {
            throw new InsufficientFundsError('Insufficient funds for reversal', {
              accountId: entry.accountId.toString(),
              available: currentBalance.toString(),
              required: entryAmount.toString()
            });
          }
        }

        accountBalance.balance = mongoose.Types.Decimal128.fromString(newBalance.toString());
        accountBalance.lastUpdated = new Date();
        await accountBalance.save({ session });
      }

      reversalTransaction.status = TransactionStatus.COMPLETED;
      reversalTransaction.processedAt = new Date();
      await reversalTransaction.save({ session });

      await session.commitTransaction();
      session.endSession();

      logger.info(`Transaction reversal completed: ${transactionId}`, {
        transactionId,
        originalTransactionId: originalTransaction.transactionId,
        userId: reversalData.userId,
        amount: originalTransaction.amount,
        currency: originalTransaction.currency,
        reason: reversalData.reason
      });

      return this.mapTransactionToDTO(reversalTransaction);
    } catch (error) {
      await session.abortTransaction();
      session.endSession();

      if (error instanceof mongoose.Error.ValidationError) {
        throw new BadRequestError('Invalid transaction data', error);
      }

      throw error;
    }
  }

  /**
   * Get transaction by MongoDB ID
   * @param id Transaction MongoDB ID
   * @returns Transaction data
   */
  async getTransactionById(id: string): Promise<TransactionDetailedResponseDTO> {
    const transaction = await Transaction.findById(id);

    if (!transaction) {
      throw new NotFoundError('Transaction not found');
    }

    return this.mapTransactionToDetailedDTO(transaction);
  }

  /**
   * Get transaction by transaction ID
   * @param transactionId Transaction ID
   * @returns Transaction data
   */
  async getTransactionByTransactionId(transactionId: string): Promise<TransactionDetailedResponseDTO> {
    const transaction = await Transaction.findOne({ transactionId });

    if (!transaction) {
      throw new NotFoundError('Transaction not found');
    }

    return this.mapTransactionToDetailedDTO(transaction);
  }

  /**
   * Get all transactions for a user with filtering and pagination
   * @param userId User ID
   * @param queryParams Query parameters for filtering
   * @returns List of matching transactions
   */
  async getUserTransactions(
    userId: string,
    queryParams: TransactionQueryParams
  ): Promise<{ transactions: TransactionResponseDTO[], total: number }> {
    const query: any = { userId: new mongoose.Types.ObjectId(userId) };

    if (queryParams.transactionType) {
      query.transactionType = queryParams.transactionType;
    }

    if (queryParams.status) {
      query.status = queryParams.status;
    }

    if (queryParams.fromDate) {
      query.createdAt = query.createdAt || {};
      query.createdAt.$gte = new Date(queryParams.fromDate);
    }

    if (queryParams.toDate) {
      query.createdAt = query.createdAt || {};
      query.createdAt.$lte = new Date(queryParams.toDate);
    }

    if (queryParams.accountNumber) {
      query.$or = [
        { fromAccount: queryParams.accountNumber },
        { toAccount: queryParams.accountNumber }
      ];
    }

    if (queryParams.minAmount) {
      const minAmountDecimal = mongoose.Types.Decimal128.fromString(queryParams.minAmount.toString());
      query.amount = query.amount || {};
      query.amount.$gte = minAmountDecimal;
    }

    if (queryParams.maxAmount) {
      const maxAmountDecimal = mongoose.Types.Decimal128.fromString(queryParams.maxAmount.toString());
      query.amount = query.amount || {};
      query.amount.$lte = maxAmountDecimal;
    }

    const page = queryParams.page || 1;
    const limit = queryParams.limit || 10;
    const skip = (page - 1) * limit;

    const sortField = queryParams.sortBy || 'createdAt';
    const sortDirection = queryParams.sortDirection === 'asc' ? 1 : -1;
    const sort: any = {};
    sort[sortField] = sortDirection;

    try {
      const [transactions, total] = await Promise.all([
        Transaction.find(query)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean(),
        Transaction.countDocuments(query)
      ]);

      return {
        transactions: transactions.map(tx => this.mapTransactionToDTO(tx as any)),
        total
      };
    } catch (error) {
      logger.error('Error fetching user transactions', {
        userId,
        error: (error as Error).message,
        queryParams
      });
      throw new DatabaseError('Error retrieving transactions', error);
    }
  }

  /**
   * Get all transactions for an account with filtering and pagination
   * @param accountNumber Account number
   * @param queryParams Query parameters for filtering
   * @returns List of matching transactions
   */
  async getAccountTransactions(
    accountNumber: string,
    queryParams: TransactionQueryParams
  ): Promise<{ transactions: TransactionResponseDTO[], total: number }> {
    const query: any = {
      $or: [
        { fromAccount: accountNumber },
        { toAccount: accountNumber }
      ]
    };

    if (queryParams.transactionType) {
      query.transactionType = queryParams.transactionType;
    }

    if (queryParams.status) {
      query.status = queryParams.status;
    }

    if (queryParams.fromDate) {
      query.createdAt = query.createdAt || {};
      query.createdAt.$gte = new Date(queryParams.fromDate);
    }

    if (queryParams.toDate) {
      query.createdAt = query.createdAt || {};
      query.createdAt.$lte = new Date(queryParams.toDate);
    }

    const page = queryParams.page || 1;
    const limit = queryParams.limit || 10;
    const skip = (page - 1) * limit;

    const sortField = queryParams.sortBy || 'createdAt';
    const sortDirection = queryParams.sortDirection === 'asc' ? 1 : -1;
    const sort: any = {};
    sort[sortField] = sortDirection;

    try {
      // Use aggregation for better performance with complex conditions
      const pipeline = [
        { $match: query },
        { $sort: sort },
        { $skip: skip },
        { $limit: limit }
      ];

      const countPipeline = [
        { $match: query },
        { $count: 'total' }
      ];

      const [transactions, countResult] = await Promise.all([
        Transaction.aggregate(pipeline),
        Transaction.aggregate(countPipeline)
      ]);

      const total = countResult.length > 0 ? countResult[0].total : 0;

      return {
        transactions: transactions.map(tx => this.mapTransactionToDTO(tx as any)),
        total
      };
    } catch (error) {
      logger.error('Error fetching account transactions', {
        accountNumber,
        error: (error as Error).message,
        queryParams
      });
      throw new DatabaseError('Error retrieving transactions', error);
    }
  }

  /**
   * Get transaction statistics for a user
   * @param userId User ID
   * @param startDate Optional start date for stats
   * @param endDate Optional end date for stats
   * @returns Transaction statistics
   */
  async getUserTransactionStats(
    userId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<any> {
    const query: any = { 
      userId: new mongoose.Types.ObjectId(userId),
      status: TransactionStatus.COMPLETED
    };

    if (startDate) {
      query.createdAt = query.createdAt || {};
      query.createdAt.$gte = startDate;
    }

    if (endDate) {
      query.createdAt = query.createdAt || {};
      query.createdAt.$lte = endDate;
    }

    try {
      const pipeline : PipelineStage[] = [
        { $match: query },
        { $group: {
            _id: {
              transactionType: "$transactionType",
              currency: "$currency"
            },
            count: { $sum: 1 },
            totalAmount: { 
              $sum: { 
                $convert: { 
                  input: "$amount", 
                  to: "decimal", 
                  onError: "0.00", 
                  onNull: "0.00" 
                } 
              } 
            },
            avgAmount: { 
              $avg: { 
                $convert: { 
                  input: "$amount", 
                  to: "decimal", 
                  onError: "0.00", 
                  onNull: "0.00" 
                } 
              } 
            }
          }
        },
        { $sort: { "_id.transactionType": 1, "_id.currency": 1 } }
      ];

      const monthlyTrendPipeline : PipelineStage[]= [
        { $match: query },
        { 
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" },
              transactionType: "$transactionType"
            },
            count: { $sum: 1 },
            totalAmount: { 
              $sum: { 
                $convert: { 
                  input: "$amount", 
                  to: "decimal", 
                  onError: "0.00", 
                  onNull: "0.00" 
                } 
              } 
            }
          }
        },
        { 
          $sort: { 
            "_id.year": 1, 
            "_id.month": 1, 
            "_id.transactionType": 1 
          } 
        }
      ];

      // Execute both aggregations in parallel
      const [stats, monthlyTrend] = await Promise.all([
        Transaction.aggregate(pipeline),
        Transaction.aggregate(monthlyTrendPipeline)
      ]);

      // Calculate overall summary
      const summary = this.calculateTransactionSummary(stats);

      return {
        summary,
        statsByType: stats,
        monthlyTrend
      };
    } catch (error) {
      logger.error('Error generating user transaction stats', {
        userId,
        error: (error as Error).message
      });
      throw new DatabaseError('Error generating transaction statistics', error);
    }
  }

  /**
   * Get transaction statistics for an account
   * @param accountNumber Account number
   * @param startDate Optional start date for stats
   * @param endDate Optional end date for stats
   * @returns Transaction statistics
   */
  async getAccountTransactionStats(
    accountNumber: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<any> {
    const query: any = { 
      $or: [
        { fromAccount: accountNumber },
        { toAccount: accountNumber }
      ],
      status: TransactionStatus.COMPLETED
    };

    if (startDate) {
      query.createdAt = query.createdAt || {};
      query.createdAt.$gte = startDate;
    }

    if (endDate) {
      query.createdAt = query.createdAt || {};
      query.createdAt.$lte = endDate;
    }

    try {
      const pipeline: PipelineStage[] = [
        { $match: query },
        { 
          $addFields: {
            direction: {
              $cond: [
                { $eq: ["$toAccount", accountNumber] },
                "INCOMING",
                "OUTGOING"
              ]
            }
          }
        },
        { 
          $group: {
            _id: {
              transactionType: "$transactionType",
              direction: "$direction",
              currency: "$currency"
            },
            count: { $sum: 1 },
            totalAmount: { 
              $sum: { 
                $convert: { 
                  input: "$amount", 
                  to: "decimal", 
                  onError: "0.00", 
                  onNull: "0.00" 
                } 
              } 
            },
            avgAmount: { 
              $avg: { 
                $convert: { 
                  input: "$amount", 
                  to: "decimal", 
                  onError: "0.00", 
                  onNull: "0.00" 
                } 
              } 
            }
          }
        },
        { $sort: { "_id.direction": 1, "_id.transactionType": 1 } }
      ];

      const dailyTrendPipeline :PipelineStage[]= [
        { $match: query },
        { 
          $addFields: {
            direction: {
              $cond: [
                { $eq: ["$toAccount", accountNumber] },
                "INCOMING",
                "OUTGOING"
              ]
            }
          }
        },
        { 
          $group: {
            _id: {
              date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
              direction: "$direction"
            },
            count: { $sum: 1 },
            totalAmount: { 
              $sum: { 
                $convert: { 
                  input: "$amount", 
                  to: "decimal", 
                  onError: "0.00", 
                  onNull: "0.00" 
                } 
              } 
            }
          }
        },
        { $sort: { "_id.date": 1, "_id.direction": 1 } }
      ];

      const [stats, dailyTrend] = await Promise.all([
        Transaction.aggregate(pipeline),
        Transaction.aggregate(dailyTrendPipeline)
      ]);

      const netFlow = this.calculateNetFlow(stats);

      return {
        netFlow,
        statsByType: stats,
        dailyTrend
      };
    } catch (error) {
      logger.error('Error generating account transaction stats', {
        accountNumber,
        error: (error as Error).message
      });
      throw new DatabaseError('Error generating transaction statistics', error);
    }
  }

  /**
   * Process pending transactions in bulk
   * Can be used for batch processing or handling delayed transactions
   * @returns Processing result
   */
  async processPendingTransactions(): Promise<{
    processed: number;
    failed: number;
    failedIds: string[];
  }> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const pendingTransactions = await Transaction.find({
        status: TransactionStatus.PENDING,
        createdAt: { $lte: new Date(Date.now() - 60000) } 
      }).session(session);

      logger.info(`Processing ${pendingTransactions.length} pending transactions`);
      
      const processed: string[] = [];
      const failed: string[] = [];

      for (const transaction of pendingTransactions) {
        try {
          transaction.status = TransactionStatus.PROCESSING;
          await transaction.save({ session });

          for (const entry of transaction.entries) {
            const accountBalance = await AccountBalance.findOne({
              accountId: entry.accountId
            }).session(session);

            if (!accountBalance) {
              throw new NotFoundError(`Account balance not found for account ID: ${entry.accountId}`);
            }

            const currentBalance = new Decimal(accountBalance.balance.toString());
            const entryAmount = new Decimal(entry.amount.toString());
            let newBalance;

            if (entry.entryType === EntryType.CREDIT) {
              newBalance = currentBalance.plus(entryAmount);
            } else {
              newBalance = currentBalance.minus(entryAmount);
              
              if (newBalance.isNegative()) {
                throw new InsufficientFundsError('Insufficient funds for transaction', {
                  accountId: entry.accountId.toString(),
                  available: currentBalance.toString(),
                  required: entryAmount.toString()
                });
              }
            }

            accountBalance.balance = mongoose.Types.Decimal128.fromString(newBalance.toString());
            accountBalance.lastUpdated = new Date();
            await accountBalance.save({ session });
          }

          transaction.status = TransactionStatus.COMPLETED;
          transaction.processedAt = new Date();
          await transaction.save({ session });

          processed.push(transaction.transactionId);
        } catch (error) {
          transaction.status = TransactionStatus.FAILED;
          transaction.failureReason = (error as Error).message;
          await transaction.save({ session });

          failed.push(transaction.transactionId);

          logger.error(`Failed to process transaction ${transaction.transactionId}`, {
            transactionId: transaction.transactionId,
            error: (error as Error).message
          });
        }
      }

      await session.commitTransaction();
      session.endSession();

      logger.info(`Processed ${processed.length} transactions successfully, ${failed.length} failed`);

      return {
        processed: processed.length,
        failed: failed.length,
        failedIds: failed
      };
    } catch (error) {
      await session.abortTransaction();
      session.endSession();

      logger.error('Error in bulk transaction processing', {
        error: (error as Error).message
      });

      throw new TransactionError('Failed to process pending transactions', error);
    }
  }

  /**
   * Calculate transaction summary from aggregation results
   * @param stats Aggregated transaction stats
   * @returns Summary object
   */
  private calculateTransactionSummary(stats: any[]): any {
    const summary: any = {
      totalCount: 0,
      totalAmountByCurrency: {},
      countByType: {}
    };

    stats.forEach(stat => {
      const transactionType = stat._id.transactionType;
      const currency = stat._id.currency;
      
      summary.totalCount += stat.count;
      
      summary.countByType[transactionType] = (summary.countByType[transactionType] || 0) + stat.count;
      
      if (!summary.totalAmountByCurrency[currency]) {
        summary.totalAmountByCurrency[currency] = 0;
      }
      summary.totalAmountByCurrency[currency] += parseFloat(stat.totalAmount.toString());
    });

    for (const currency in summary.totalAmountByCurrency) {
      summary.totalAmountByCurrency[currency] = new Decimal(
        summary.totalAmountByCurrency[currency]
      ).toFixed(2);
    }

    return summary;
  }

  /**
   * Calculate net flow from stats aggregation
   * @param stats Aggregated transaction stats
   * @returns Net flow object
   */
  private calculateNetFlow(stats: any[]): any {
    const netFlow: Record<string, string> = {};
    const incomingTotals: Record<string, Decimal> = {};
    const outgoingTotals: Record<string, Decimal> = {};

    stats.forEach(stat => {
      const direction = stat._id.direction;
      const currency = stat._id.currency;
      const amount = new Decimal(stat.totalAmount.toString());
      
      if (direction === 'INCOMING') {
        incomingTotals[currency] = (incomingTotals[currency] || new Decimal(0)).plus(amount);
      } else {
        outgoingTotals[currency] = (outgoingTotals[currency] || new Decimal(0)).plus(amount);
      }
    });

    for (const currency of Object.keys({...incomingTotals, ...outgoingTotals})) {
      const incoming = incomingTotals[currency] || new Decimal(0);
      const outgoing = outgoingTotals[currency] || new Decimal(0);
      netFlow[currency] = incoming.minus(outgoing).toFixed(2);
    }

    return netFlow;
  }

  /**
   * Map transaction document to basic DTO
   * @param transaction Transaction document
   * @returns Transaction response DTO
   */
  private mapTransactionToDTO(transaction: ITransaction): TransactionResponseDTO {
    return {
      id: transaction._id.toString(),
      transactionId: transaction.transactionId,
      transactionType: transaction.transactionType,
      amount: transaction.amount.toString(),
      currency: transaction.currency as CurrencyCode,
      fromAccount: transaction.fromAccount,
      toAccount: transaction.toAccount,
      status: transaction.status,
      description: transaction.description,
      reference: transaction.reference,
      createdAt: transaction.createdAt,
      processedAt: transaction.processedAt
    };
  }

  /**
   * Map transaction document to detailed DTO
   * @param transaction Transaction document
   * @returns Transaction detailed response DTO
   */
  private mapTransactionToDetailedDTO(transaction: ITransaction): TransactionDetailedResponseDTO {
    const entries = transaction.entries.map(entry => ({
      accountId: entry.accountId.toString(),
      entryType: entry.entryType,
      amount: entry.amount.toString()
    }));

    const metadata: Record<string, any> = {};
    transaction.metadata.forEach((value, key) => {
      metadata[key] = value;
    });

    return {
      ...this.mapTransactionToDTO(transaction),
      entries,
      metadata,
      failureReason: transaction.failureReason,
      userId: transaction.userId.toString()
    };
  }
}

export default new TransactionService()