import { Document, Types } from "mongoose";

/*
 * Account Interface
 * This interface defines the structure of an account object in the system.
 * It includes properties such as userId, accountNumber, accountType, currency,
 * isActive status, metadata, and timestamps for creation and updates.
 */

export enum AccountType {
  SAVINGS = "SAVINGS",
  INVESTMENT = "INVESTMENT",
  CREDIT = "CREDIT",
  SYSTEM = "SYSTEM",
}

export enum CurrencyCode {
  USD = "USD",
  EUR = "EUR",
  GBP = "GBP",
  JPY = "JPY",
  CAD = "CAD",
  CHF = "CHF",
  AUD = "AUD",
  CNY = "CNY",
  INR = "INR",
  NGN = "NGN",
}

export interface IAccount extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  accountNumber: string;
  accountType: AccountType;
  currency: CurrencyCode;
  isActive: boolean;
  metadata: Map<string, any>;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface IAccountCreate {
  userId: string;
  accountType: AccountType;
  currency: CurrencyCode;
  initialBalance?: number;
  metadata?: Record<string, any>;
}

export interface IAccountUpdate {
  accountType?: AccountType;
  isActive?: boolean;
  metadata?: Record<string, any>;
}

export interface AccountResponseDTO {
  id: string;
  accountNumber: string;
  accountType: AccountType;
  currency: CurrencyCode;
  balance: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountQueryParams {
  accountType?: AccountType;
  currency?: CurrencyCode;
  isActive?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
}
