import { Document, Types } from "mongoose";
import { CurrencyCode } from "./account.interface";

/*
 * Account Balance Interface
 * This interface defines the structure of an account balance object in the system.
 *   It includes properties such as accountId, currency, balance,
 *   lastUpdated timestamp, and timestamps for creation and updates.
 * It is used to manage the balance of an account in different currencies.
 */
export interface IAccountBalance extends Document {
  accountId: Types.ObjectId;
  currency: CurrencyCode;
  balance: string | Types.Decimal128;
  lastUpdated: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAccountBalanceCreate {
  accountId: string;
  currency: CurrencyCode;
  initialBalance?: number;
}

export interface IAccountBalanceUpdate {
  balance: number;
}

export interface AccountBalanceResponseDTO {
  accountId: string;
  currency: CurrencyCode;
  balance: string;
  lastUpdated: Date;
}

export interface IAccountBalanceHistoryEntry {
  accountId: Types.ObjectId;
  transactionId: Types.ObjectId;
  balanceBefore: string | Types.Decimal128;
  balanceAfter: string | Types.Decimal128;
  changeAmount: string | Types.Decimal128;
  timestamp: Date;
}
