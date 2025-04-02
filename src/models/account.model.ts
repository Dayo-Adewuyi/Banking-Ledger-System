
import mongoose, { Schema, Document } from 'mongoose';
import { IAccount, AccountType, CurrencyCode } from '../interfaces';


/*
 * Account Schema
 * This schema defines the structure of an account object in the system.
 * It includes properties such as userId, accountNumber, accountType,
 * currency, isActive status, and metadata.
 * The accountType can be either  SAVINGS, INVESTMENT, CREDIT, or SYSTEM.
 */
const AccountSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    accountNumber: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    accountType: {
      type: String,
      enum: Object.values(AccountType),
      required: true
    },
    currency: {
      type: String,
      enum: Object.values(CurrencyCode),
      required: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    metadata: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true,
    versionKey: 'version' 
  }
);

export default mongoose.model<IAccount & Document>('Account', AccountSchema);
