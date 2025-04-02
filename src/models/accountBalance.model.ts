import mongoose, { Schema, Document } from "mongoose";
import { IAccountBalance } from "../interfaces/accountBalance.interface";

/*
 * Account Balance Schema
 * This schema defines the structure of an account balance object in the system.
 * It includes properties such as accountId, currency, balance,
 * lastUpdated timestamp, and timestamps for creation and updates.
 * It is used to manage the balance of an account in different currencies.
 */
const AccountBalanceSchema: Schema = new Schema(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      unique: true,
      index: true,
    },
    currency: {
      type: String,
      required: true,
    },
    balance: {
      type: Schema.Types.Decimal128,
      required: true,
      default: mongoose.Types.Decimal128.fromString("0"),
      get: (v: mongoose.Types.Decimal128) => v.toString(),
      set: (v: number) => mongoose.Types.Decimal128.fromString(v.toString()),
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

AccountBalanceSchema.methods.toJSON = function () {
  const obj = this.toObject();
  if (obj.balance) {
    obj.balance = obj.balance.toString();
  }
  return obj;
};

export default mongoose.model<IAccountBalance & Document>(
  "AccountBalance",
  AccountBalanceSchema
);
