import { Document, Types } from "mongoose";
import { CurrencyCode } from "./account.interface";

/*
 * Transaction Interface
 * This interface defines the structure of a transaction object in the system.
 * It includes properties such as transactionId, userId, transactionType,
 * amount, currency, status, description, metadata, and timestamps for creation and updates.
 * It is used to manage various types of transactions such as deposits, withdrawals,
 * transfers, payments, fees, reversals, and refunds.
 */

export enum TransactionType {
  DEPOSIT = "DEPOSIT",
  WITHDRAWAL = "WITHDRAWAL",
  TRANSFER = "TRANSFER",
  PAYMENT = "PAYMENT",
  FEE = "FEE",
  INTEREST = "INTEREST",
  ADJUSTMENT = "ADJUSTMENT",
  REVERSAL = "REVERSAL",
  REFUND = "REFUND",
}

export enum TransactionStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

export enum EntryType {
  DEBIT = "DEBIT",
  CREDIT = "CREDIT",
}

export interface ITransactionEntry {
  accountId: Types.ObjectId;
  entryType: EntryType;
  amount: string | Types.Decimal128;
}

export interface ITransaction extends Document {
  _id: string;
  transactionId: string;
  transactionType: TransactionType;
  userId: Types.ObjectId;
  entries: ITransactionEntry[];
  amount: string | Types.Decimal128;
  currency: CurrencyCode;
  fromAccount?: string;
  toAccount?: string;
  status: TransactionStatus;
  description: string;
  reference?: string;
  metadata: Map<string, any>;
  failureReason?: string;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface DepositTransactionDTO {
  userId: string;
  accountNumber: string;
  amount: number;
  currency: CurrencyCode;
  description?: string;
  reference?: string;
  metadata?: Record<string, any>;
}

export interface WithdrawalTransactionDTO {
  userId: string;
  accountNumber: string;
  amount: number;
  currency: CurrencyCode;
  description?: string;
  reference?: string;
  metadata?: Record<string, any>;
}

export interface TransferTransactionDTO {
  userId: string;
  fromAccountNumber: string;
  toAccountNumber: string;
  amount: number;
  currency: CurrencyCode;
  description?: string;
  reference?: string;
  metadata?: Record<string, any>;
}

export interface PaymentTransactionDTO {
  userId: string;
  accountNumber: string;
  recipientName: string;
  recipientReference: string;
  amount: number;
  currency: CurrencyCode;
  description?: string;
  reference?: string;
  metadata?: Record<string, any>;
}

export interface FeeTransactionDTO {
  userId: string;
  accountNumber: string;
  amount: number;
  currency: CurrencyCode;
  description: string;
  reference?: string;
  metadata?: Record<string, any>;
}

export interface ReversalTransactionDTO {
  userId: string;
  originalTransactionId: string;
  reason: string;
  metadata?: Record<string, any>;
}

export interface TransactionResponseDTO {
  id: string;
  transactionId: string;
  transactionType: TransactionType;
  amount: string;
  currency: CurrencyCode;
  fromAccount?: string;
  toAccount?: string;
  status: TransactionStatus;
  description: string;
  reference?: string;
  createdAt: Date;
  processedAt?: Date;
}

export interface TransactionDetailedResponseDTO extends TransactionResponseDTO {
  entries: {
    accountId: string;
    entryType: EntryType;
    amount: string;
  }[];
  metadata: Record<string, any>;
  failureReason?: string;
  userId: string;
}

export interface TransactionQueryParams {
  transactionType?: TransactionType;
  status?: TransactionStatus;
  fromDate?: Date;
  toDate?: Date;
  accountNumber?: string;
  minAmount?: number;
  maxAmount?: number;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
}
