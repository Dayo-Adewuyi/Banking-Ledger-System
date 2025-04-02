import mongoose, { Schema, Document } from "mongoose";
import {
  ITransaction,
  TransactionType,
  TransactionStatus,
  EntryType,
} from "../interfaces";

/*
 * Entry Schema
 * This schema defines the structure of an entry object in a transaction.
 * It includes properties such as accountId, entryType, and amount.
 * The entryType can be either DEBIT or CREDIT.
 */
const EntrySchema = new Schema(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },
    entryType: {
      type: String,
      enum: Object.values(EntryType),
      required: true,
    },
    amount: {
      type: Schema.Types.Decimal128,
      required: true,
      get: (v: mongoose.Types.Decimal128) => v.toString(),
      set: (v: number) => mongoose.Types.Decimal128.fromString(v.toString()),
    },
  },
  { _id: false }
);

/*
 * Transaction Schema
 * This schema defines the structure of a transaction object in the system.
 * It includes properties such as transactionId, transactionType, userId,
 * entries (which are defined by the EntrySchema), amount, currency, status,
 * description, metadata, and failureReason.
 * The transactionType can be either INCOME or EXPENSE.
 */
const TransactionSchema: Schema = new Schema(
  {
    transactionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    transactionType: {
      type: String,
      enum: Object.values(TransactionType),
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    entries: {
      type: [EntrySchema],
      required: true,
      validate: [
        {
          validator: function (entries: any[]) {
            return entries.length >= 2;
          },
          message:
            "A transaction must have at least two entries for double-entry accounting.",
        },
        {
          validator: function (entries: any[]) {
            const sum = entries.reduce((acc, entry) => {
              const amount = parseFloat(entry.amount.toString());
              return (
                acc + (entry.entryType === EntryType.DEBIT ? amount : -amount)
              );
            }, 0);
            return sum === 0;
          },
          message:
            "Debits and credits must balance exactly (Σ debits = Σ credits).",
        },
      ],
    },
    amount: {
      type: Schema.Types.Decimal128,
      required: true,
      get: (v: mongoose.Types.Decimal128) => v.toString(),
      set: (v: number) => mongoose.Types.Decimal128.fromString(v.toString()),
    },
    currency: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(TransactionStatus),
      default: TransactionStatus.PENDING,
      index: true,
    },
    description: {
      type: String,
      default: "",
    },
    metadata: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {},
    },
    failureReason: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

TransactionSchema.index({ userId: 1, status: 1, createdAt: -1 });
TransactionSchema.index({ transactionType: 1, status: 1, createdAt: -1 });
TransactionSchema.index({ createdAt: -1 });

TransactionSchema.methods.toJSON = function () {
  const obj = this.toObject();
  if (obj.amount) {
    obj.amount = obj.amount.toString();
  }
  if (obj.entries) {
    obj.entries.forEach((entry: any) => {
      if (entry.amount) {
        entry.amount = entry.amount.toString();
      }
    });
  }
  return obj;
};

TransactionSchema.statics.createWithEntries = async function (
  transactionData: any,
  entries: { accountId: string; entryType: EntryType; amount: number }[],
  session: mongoose.ClientSession
) {
  const transaction = new this({
    ...transactionData,
    entries,
  });

  return transaction.save({ session });
};

export default mongoose.model<ITransaction & Document>(
  "Transaction",
  TransactionSchema
);
