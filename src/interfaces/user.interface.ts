import { Document } from "mongoose";

/*
 * User Interface
 * This interface defines the structure of a user object in the system.
 * It includes properties such as email, password, firstName, lastName,
 * status, role, security information, contact details, and notification preferences.
 * The user can have different roles and statuses.
 */

export enum UserRole {
  USER = "user",
  ADMIN = "admin",
  SYSTEM = "system",
}

export enum UserStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  SUSPENDED = "suspended",
  PENDING_VERIFICATION = "pending_verification",
}

export interface IUserSecurity {
  passwordLastChanged: Date;
  previousPasswords: string[];
  failedLoginAttempts: number;
  lastFailedLogin?: Date;
  lockedUntil?: Date;
}

export interface IUserContact {
  phone?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
}

export interface IUserNotifications {
  email: boolean;
  sms: boolean;
  push: boolean;
  marketing: boolean;
}

export interface IUser extends Document {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  role: UserRole;
  security: IUserSecurity;
  contact?: IUserContact;
  notifications: IUserNotifications;
  dateOfBirth?: Date;
  lastLogin: Date | null;
  metadata: Map<string, any>;
  fullName: string;
  createdAt: Date;
  updatedAt: Date;

  comparePassword(candidatePassword: string): Promise<boolean>;
}

export interface IUserCreate {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: UserRole;
  dateOfBirth?: Date;
  contact?: IUserContact;
  notifications?: {
    email?: boolean;
    sms?: boolean;
    push?: boolean;
    marketing?: boolean;
  };
  metadata?: Record<string, any>;
}

export interface IUserUpdate {
  firstName?: string;
  lastName?: string;
  status?: UserStatus;
  contact?: Partial<IUserContact>;
  notifications?: Partial<IUserNotifications>;
  metadata?: Record<string, any>;
}

export interface IPasswordChange {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface UserResponseDTO {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
  lastLogin?: Date;
}

export interface UserDetailedResponseDTO extends UserResponseDTO {
  contact?: IUserContact;
  notifications: IUserNotifications;
  dateOfBirth?: Date;
  metadata: Record<string, any>;
}

export interface AuthResponseDTO {
  user: UserResponseDTO;
  token: string;
  refreshToken: string;
  tokenExpires: number;
}

export interface ILoginDTO {
  email: string;
  password: string;
}

export interface IRefreshTokenDTO {
  refreshToken: string;
}

export interface IPasswordResetRequestDTO {
  email: string;
}

export interface IPasswordResetDTO {
  token: string;
  newPassword: string;
  confirmPassword: string;
}

export interface IEmailVerificationDTO {
  token: string;
}

export interface UserQueryParams {
  status?: UserStatus;
  role?: UserRole;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
}
