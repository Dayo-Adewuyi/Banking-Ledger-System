import mongoose from 'mongoose';
import Account from '../models/account.model';
import AccountBalance from '../models/accountBalance.model';
import { 
  IAccount, 
  IAccountCreate,
  IAccountUpdate,
  AccountResponseDTO 
} from '../interfaces/account.interface';
import { IAccountBalance } from '../interfaces/accountBalance.interface';
import { generateAccountNumber } from '../utils/crypto';
import { NotFoundError, BadRequestError, ConflictError } from '../utils/errors';
import { logger } from '../utils/logger';

export class AccountService {
  /**
   * Create a new account with a separate balance record
   * @param accountData Account creation data
   * @returns Created account with balance details
   */
  async createAccount(accountData: IAccountCreate): Promise<AccountResponseDTO> {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const accountNumber = generateAccountNumber();
      
      const account = new Account({
        userId: new mongoose.Types.ObjectId(accountData.userId),
        accountNumber,
        accountType: accountData.accountType,
        currency: accountData.currency,
        isActive: true,
        metadata: accountData.metadata || {}
      });
      
      await account.save({ session });
      
      const initialBalance = accountData.initialBalance || 0;
      const accountBalance = new AccountBalance({
        accountId: account._id,
        currency: accountData.currency,
        balance: initialBalance,
        lastUpdated: new Date()
      });
      
      await accountBalance.save({ session });
      
      await session.commitTransaction();
      
      return this.mapAccountToResponseDTO(account, accountBalance);
    } catch (error) {
      await session.abortTransaction();
      
      if (error instanceof mongoose.Error.ValidationError) {
        throw new BadRequestError('Invalid account data', error);
      }
      
      if ((error as any).code === 11000) {
        throw new ConflictError('Account with this number already exists');
      }
      
      throw error;
    } finally {
      session.endSession();
    }
  }
  
  /**
   * Get account by ID with its balance
   * @param accountId Account ID
   * @returns Account with balance
   */
  async getAccountById(accountId: string): Promise<AccountResponseDTO> {
    const account = await Account.findById(accountId);
    
    if (!account) {
      throw new NotFoundError('Account not found');
    }
    
    const accountBalance = await AccountBalance.findOne({ accountId: account._id });
    
    if (!accountBalance) {
      throw new NotFoundError('Account balance not found');
    }
    
    return this.mapAccountToResponseDTO(account, accountBalance);
  }
  
  /**
   * Get account by account number with its balance
   * @param accountNumber Account number
   * @returns Account with balance
   */
  async getAccountByNumber(accountNumber: string): Promise<AccountResponseDTO> {
    const account = await Account.findOne({ accountNumber });
    
    if (!account) {
      throw new NotFoundError('Account not found');
    }
    
    const accountBalance = await AccountBalance.findOne({ accountId: account._id });
    
    if (!accountBalance) {
      throw new NotFoundError('Account balance not found');
    }
    
    return this.mapAccountToResponseDTO(account, accountBalance);
  }
  
  /**
   * Get all accounts for a user with their balances
   * @param userId User ID
   * @param page Page number (pagination)
   * @param limit Number of items per page
   * @returns List of accounts with balances
   */
  async getUserAccounts(
    userId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<{ accounts: AccountResponseDTO[], total: number }> {
    const skip = (page - 1) * limit;
    
    const accounts: IAccount[] = await Account.find({ userId, isActive: true })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });
    
    const total = await Account.countDocuments({ userId, isActive: true });
    
    const accountIds = accounts.map(account => account._id);
    const balances = await AccountBalance.find({ 
      accountId: { $in: accountIds } 
    });
    
    const balanceMap = new Map<string, IAccountBalance>();
    for (const balance of balances) {
      balanceMap.set(balance.accountId.toString(), balance);
    }
    
    const accountDTOs = accounts.map(account => {
      const balance = balanceMap.get(account.userId.toString());
      if (!balance) {
        logger.warn(`No balance found for account ${account._id}`, { accountNumber: account.accountNumber });
      }
      return this.mapAccountToResponseDTO(
        account, 
        balance || {
          accountId: account._id,
          currency: account.currency,
          balance: '0',
          lastUpdated: new Date()
        } as any
      );
    });
    
    return {
      accounts: accountDTOs,
      total
    };
  }
  
  /**
   * Update account details (not the balance)
   * @param accountId Account ID
   * @param updateData Update data
   * @returns Updated account with balance
   */
  async updateAccount(accountId: string, updateData: IAccountUpdate): Promise<AccountResponseDTO> {
    const account = await Account.findById(accountId);
    
    if (!account) {
      throw new NotFoundError('Account not found');
    }
    
    if (updateData.accountType !== undefined) {
      account.accountType = updateData.accountType;
    }
    
    if (updateData.isActive !== undefined) {
      account.isActive = updateData.isActive;
    }
    
    if (updateData.metadata) {
      for (const [key, value] of Object.entries(updateData.metadata)) {
        account.metadata.set(key, value);
      }
    }
    
    await account.save();
    
    const accountBalance = await AccountBalance.findOne({ accountId: account._id });
    
    if (!accountBalance) {
      throw new NotFoundError('Account balance not found');
    }
    
    return this.mapAccountToResponseDTO(account, accountBalance);
  }
  
  /**
   * Update account balance with optimistic concurrency control
   * @param accountId Account ID
   * @param amount New balance amount
   * @returns Updated account with balance
   */
  async updateBalance(accountId: string, amount: number): Promise<AccountResponseDTO> {
    const accountBalance = await AccountBalance.findOne({ accountId });
    
    if (!accountBalance) {
      throw new NotFoundError('Account balance not found');
    }
    
    accountBalance.balance = mongoose.Types.Decimal128.fromString(amount.toString());
    accountBalance.lastUpdated = new Date();
    
    await accountBalance.save();
    
    const account = await Account.findById(accountId);
    
    if (!account) {
      throw new NotFoundError('Account not found');
    }
    
    return this.mapAccountToResponseDTO(account, accountBalance);
  }
  
  /**
   * Map account and balance documents to response DTO
   * @param account Account document
   * @param balance Balance document
   * @returns Account response DTO
   */
  private mapAccountToResponseDTO(
    account: IAccount, 
    balance: IAccountBalance
  ): AccountResponseDTO {
    return {
      id: account._id.toString(),
      accountNumber: account.accountNumber,
      accountType: account.accountType,
      currency: account.currency,
      balance: balance.balance.toString(),
      isActive: account.isActive,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt
    };
  }
}

export default new AccountService();