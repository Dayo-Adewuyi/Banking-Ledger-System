import mongoose, { Schema, Document } from 'mongoose';
import { IUser } from '../interfaces/user.interface';
import { hashPassword, verifyPassword } from '../utils';

/*
 * User Schema
 * This schema defines the structure of a user object in the system.
 * It includes properties such as name, email, password, role, and permissions.
 * The role can be either USER or ADMIN.
 */
const UserSchema: Schema = new Schema(
    {
      email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        index: true
      },
      password: {
        type: String,
        required: true,
        select: false 
      },
      firstName: {
        type: String,
        required: true,
        trim: true
      },
      lastName: {
        type: String,
        required: true,
        trim: true
      },
      isActive: {
        type: Boolean,
        default: true,
        index: true
      },
      role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user',
        index: true
      },
      lastLogin: {
        type: Date,
        default: null
      },
      metadata: {
        type: Map,
        of: Schema.Types.Mixed,
        default: {}
      }
    },
    {
      timestamps: true
    }
  );

UserSchema.pre('save', async function (this: IUser, next) {
    if (this.isModified('password')) {
      this.password = await hashPassword(this.password);
    }
    next();
  }
);

UserSchema.methods.comparePassword = async function (
    this: IUser,
    candidatePassword: string
): Promise<boolean> {
    return await verifyPassword(candidatePassword, this.password);
}

UserSchema.virtual('fullName').get(function (this: IUser) {
    return `${this.firstName} ${this.lastName}`;
  }
);

UserSchema.set('toJSON', {
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.password;
      return ret;
    }
  });
  
  const UserModel = mongoose.model<IUser & Document>('User', UserSchema);
  
  export default UserModel;