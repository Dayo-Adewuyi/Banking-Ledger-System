import mongoose from 'mongoose';
import * as jwt from 'jsonwebtoken';
import { Secret, SignOptions, JwtPayload } from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/user.model';
import { 
  IUser, 
  IUserCreate, 
  IUserUpdate, 
  UserStatus, 
  UserRole,
  UserResponseDTO,
  UserDetailedResponseDTO,
  AuthResponseDTO,
  ILoginDTO,
  IPasswordChange,
  IPasswordResetRequestDTO,
  IPasswordResetDTO
} from '../interfaces/user.interface';
import { jwtConfig, passwordPolicy } from '../config/auth';
import { 
  BadRequestError, 
  NotFoundError, 
  UnauthorizedError, 
  ConflictError 
} from '../utils/errors';
import { logger, authLogger } from '../utils/logger';
import { 
  generateSecureToken, 
  hashPassword, 
  verifyPassword 
} from '../utils/crypto';
import { validatePassword } from '../utils/validators';

export class UserService {
  /**
   * Create a new user
   * @param userData User data for creation
   * @returns Created user data
   */
  async createUser(userData: IUserCreate): Promise<UserResponseDTO> {
    try {
      const existingUser = await User.findOne({ email: userData.email.toLowerCase() });
      
      if (existingUser) {
        throw new ConflictError('User with this email already exists');
      }
      
      const passwordCheck = validatePassword(userData.password);
      if (!passwordCheck.valid) {
        throw new BadRequestError(passwordCheck.message || 'Password does not meet security requirements');
      }
      
      const user = new User({
        email: userData.email.toLowerCase(),
        password: userData.password, 
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role || UserRole.USER,
        status: UserStatus.PENDING_VERIFICATION,
        security: {
          passwordLastChanged: new Date(),
          previousPasswords: [],
          failedLoginAttempts: 0
        },
        notifications: {
          email: userData.notifications?.email ?? true,
          sms: userData.notifications?.sms ?? false,
          push: userData.notifications?.push ?? false,
          marketing: userData.notifications?.marketing ?? false
        },
        dateOfBirth: userData.dateOfBirth,
        contact: userData.contact,
        metadata: new Map(Object.entries(userData.metadata || {}))
      });
      
      await user.save();
      
      const verificationToken = await this.createVerificationToken(user._id);
      
      // TODO: Send verification email with token
      
      authLogger.info(`User created: ${user._id}`, { 
        userId: user._id.toString(),
        email: user.email
      });
      
      return this.mapUserToResponseDTO(user);
    } catch (error) {
      if (error instanceof mongoose.Error.ValidationError) {
        throw new BadRequestError('Invalid user data', error);
      }
      throw error;
    }
  }
  
  /**
   * Authenticate user and generate JWT tokens
   * @param loginData Login credentials
   * @returns Auth response with user data and tokens
   */
  async login(loginData: ILoginDTO): Promise<AuthResponseDTO> {
    const { email, password } = loginData;
    
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    
    if (!user) {
      authLogger.warn(`Failed login attempt: User not found`, { email });
      throw new UnauthorizedError('Invalid email or password');
    }
    
    if (user.security.lockedUntil && user.security.lockedUntil > new Date()) {
      const lockTimeRemaining = Math.ceil((user.security.lockedUntil.getTime() - Date.now()) / 60000);
      
      authLogger.warn(`Login attempted on locked account`, { 
        userId: user._id.toString(),
        email: user.email,
        lockedUntil: user.security.lockedUntil
      });
      
      throw new UnauthorizedError(`Account is temporarily locked. Please try again in ${lockTimeRemaining} minutes.`);
    }
    
    const isPasswordValid = await user.comparePassword(password);
    
    if (!isPasswordValid) {
      user.security.failedLoginAttempts = (user.security.failedLoginAttempts || 0) + 1;
      user.security.lastFailedLogin = new Date();
      
      if (user.security.failedLoginAttempts >= 5) {
        // Lock for 30 minutes
        const lockUntil = new Date(Date.now() + 30 * 60 * 1000);
        user.security.lockedUntil = lockUntil;
        
        authLogger.warn(`Account locked due to too many failed login attempts`, {
          userId: user._id.toString(),
          email: user.email,
          failedAttempts: user.security.failedLoginAttempts,
          lockedUntil: lockUntil
        });
      }
      
      await user.save();
      throw new UnauthorizedError('Invalid email or password');
    }
    
    // Check if the account is active
    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedError('Your account has been suspended. Please contact support.');
    }
    
    if (user.status === UserStatus.INACTIVE) {
      throw new UnauthorizedError('Your account is inactive. Please contact support.');
    }
    
    user.security.failedLoginAttempts = 0;
    user.security.lockedUntil = undefined;
    user.lastLogin = new Date();
    
    if (user.status === UserStatus.PENDING_VERIFICATION) {
      user.status = UserStatus.ACTIVE;
    }
    
    await user.save();
    
    const { token, refreshToken, tokenExpires } = this.generateTokens(user);
    
    authLogger.info(`User logged in: ${user._id}`, { 
      userId: user._id.toString(),
      email: user.email
    });
    
    return {
      user: this.mapUserToResponseDTO(user),
      token,
      refreshToken,
      tokenExpires
    };
  }
  
  /**
   * Issue new access token using a valid refresh token
   * @param refreshToken Refresh token
   * @returns New auth tokens
   */
  async refreshAccessToken(refreshToken: string): Promise<AuthResponseDTO> {
    try {
      const verifyOptions = {
        issuer: jwtConfig.issuer,
        audience: jwtConfig.audience
      };
      
      const decoded = jwt.verify(refreshToken, jwtConfig.refreshSecret, verifyOptions) as JwtPayload;
      
      if (!decoded.id) {
        throw new UnauthorizedError('Invalid refresh token');
      }
      
      const user = await User.findById(decoded.id);
      
      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedError('User not found or inactive');
      }
      
      const { token, refreshToken: newRefreshToken, tokenExpires } = this.generateTokens(user);
      
      authLogger.info(`Access token refreshed for user: ${user._id}`, { 
        userId: user._id.toString() 
      });
      
      return {
        user: this.mapUserToResponseDTO(user),
        token,
        refreshToken: newRefreshToken,
        tokenExpires
      };
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Invalid or expired refresh token');
      }
      throw error;
    }
  }
  
  /**
   * Get user by ID
   * @param userId User ID
   * @returns User data
   */
  async getUserById(userId: string): Promise<UserDetailedResponseDTO> {
    const user = await User.findById(userId);
    
    if (!user) {
      throw new NotFoundError('User not found');
    }
    
    return this.mapUserToDetailedResponseDTO(user);
  }
  
  /**
   * Get user by email
   * @param email User email
   * @returns User data
   */
  async getUserByEmail(email: string): Promise<UserDetailedResponseDTO> {
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      throw new NotFoundError('User not found');
    }
    
    return this.mapUserToDetailedResponseDTO(user);
  }
  
  /**
   * Update user profile
   * @param userId User ID
   * @param updateData Update data
   * @returns Updated user data
   */
  async updateUser(userId: string, updateData: IUserUpdate): Promise<UserDetailedResponseDTO> {
    const user = await User.findById(userId);
    
    if (!user) {
      throw new NotFoundError('User not found');
    }
    
    if (updateData.firstName) {
      user.firstName = updateData.firstName;
    }
    
    if (updateData.lastName) {
      user.lastName = updateData.lastName;
    }
    
    if (updateData.status) {
      user.status = updateData.status;
    }
    
    if (updateData.contact) {
      user.contact = {
        ...user.contact || {},
        ...updateData.contact
      };
    }
    
    if (updateData.notifications) {
      user.notifications = {
        ...user.notifications,
        ...updateData.notifications
      };
    }
    
    if (updateData.metadata) {
      for (const [key, value] of Object.entries(updateData.metadata)) {
        user.metadata.set(key, value);
      }
    }
    
    await user.save();
    
    logger.info(`User updated: ${user._id}`, { 
      userId: user._id.toString() 
    });
    
    return this.mapUserToDetailedResponseDTO(user);
  }
  
  /**
   * Change user password
   * @param userId User ID
   * @param passwordData Password change data
   */
  async changePassword(userId: string, passwordData: IPasswordChange): Promise<void> {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      throw new BadRequestError('New password and confirmation do not match');
    }
    
    const user = await User.findById(userId).select('+password');
    
    if (!user) {
      throw new NotFoundError('User not found');
    }
    
    const isCurrentPasswordValid = await user.comparePassword(passwordData.currentPassword);
    
    if (!isCurrentPasswordValid) {
      authLogger.warn(`Failed password change: Invalid current password`, { 
        userId: user._id.toString() 
      });
      
      throw new UnauthorizedError('Current password is incorrect');
    }
    
    const passwordCheck = validatePassword(passwordData.newPassword);
    if (!passwordCheck.valid) {
      throw new BadRequestError(passwordCheck.message || 'Password does not meet security requirements');
    }
    

    if (user.security.previousPasswords && user.security.previousPasswords.length > 0) {
      const isPreviousPassword = await this.checkIfPasswordWasUsedBefore(
        passwordData.newPassword, 
        user.security.previousPasswords
      );
      
      if (isPreviousPassword) {
        throw new BadRequestError(
          `Cannot reuse any of your last ${passwordPolicy.preventPasswordReuse} passwords`
        );
      }
    }
    
    if (!user.security.previousPasswords) {
      user.security.previousPasswords = [];
    }
    
    user.security.previousPasswords.push(user.password);
    
    if (user.security.previousPasswords.length > passwordPolicy.preventPasswordReuse) {
      user.security.previousPasswords = user.security.previousPasswords.slice(
        user.security.previousPasswords.length - passwordPolicy.preventPasswordReuse
      );
    }
    
    user.password = passwordData.newPassword;
    user.security.passwordLastChanged = new Date();
    
    await user.save();
    
    authLogger.info(`Password changed for user: ${user._id}`, { 
      userId: user._id.toString() 
    });
  }
  
  /**
   * Request password reset
   * @param data Password reset request data
   * @returns Boolean indicating if the request was successful
   */
  async requestPasswordReset(data: IPasswordResetRequestDTO): Promise<boolean> {
    const user = await User.findOne({ email: data.email.toLowerCase() });
    
    if (!user) {
      authLogger.info(`Password reset requested for non-existent user`, { 
        email: data.email 
      });
      
      return true;
    }
    
    if (user.status !== UserStatus.ACTIVE) {
      authLogger.info(`Password reset requested for inactive user`, { 
        userId: user._id.toString(),
        email: user.email,
        status: user.status
      });
      
      return true;
    }
    
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    
    const hashedToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');
    
    user.metadata.set('passwordResetToken', hashedToken);
    user.metadata.set('passwordResetExpires', resetTokenExpiry.toISOString());
    
    await user.save();
    
    // TODO: Send email with reset token
    // This would typically call an email service to send the reset token to the user
    
    authLogger.info(`Password reset token generated for user: ${user._id}`, { 
      userId: user._id.toString(),
      email: user.email,
      tokenExpiry: resetTokenExpiry
    });
    
    return true;
  }
  
  /**
   * Reset password using token
   * @param data Password reset data
   */
  async resetPassword(data: IPasswordResetDTO): Promise<void> {
    if (data.newPassword !== data.confirmPassword) {
      throw new BadRequestError('New password and confirmation do not match');
    }
    
    const hashedToken = crypto
      .createHash('sha256')
      .update(data.token)
      .digest('hex');
    
    const user = await User.findOne({
      'metadata.passwordResetToken': hashedToken,
      'metadata.passwordResetExpires': { $gt: new Date().toISOString() }
    }).select('+password');
    
    if (!user) {
      throw new BadRequestError('Token is invalid or has expired');
    }
    
    const passwordCheck = validatePassword(data.newPassword);
    if (!passwordCheck.valid) {
      throw new BadRequestError(passwordCheck.message || 'Password does not meet security requirements');
    }
    
    user.password = data.newPassword;
    user.security.passwordLastChanged = new Date();
    
    user.metadata.delete('passwordResetToken');
    user.metadata.delete('passwordResetExpires');
    
    user.security.failedLoginAttempts = 0;
    user.security.lockedUntil = undefined;
    
    await user.save();
    
    authLogger.info(`Password reset successful for user: ${user._id}`, { 
      userId: user._id.toString() 
    });
  }
  
  /**
   * Deactivate user account
   * @param userId User ID
   */
  async deactivateUser(userId: string): Promise<void> {
    const user = await User.findById(userId);
    
    if (!user) {
      throw new NotFoundError('User not found');
    }
    
    user.status = UserStatus.INACTIVE;
    await user.save();
    
    logger.info(`User deactivated: ${user._id}`, { 
      userId: user._id.toString() 
    });
  }
  
  /**
   * Reactivate user account
   * @param userId User ID
   */
  async reactivateUser(userId: string): Promise<void> {
    const user = await User.findById(userId);
    
    if (!user) {
      throw new NotFoundError('User not found');
    }
    
    user.status = UserStatus.ACTIVE;
    await user.save();
    
    logger.info(`User reactivated: ${user._id}`, { 
      userId: user._id.toString() 
    });
  }
  
  /**
   * Create email verification token
   * @param userId User ID
   * @returns Verification token
   */
  private async createVerificationToken(userId: string): Promise<string> {
    const token = generateSecureToken(32);
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
    
    const user = await User.findById(userId);
    
    if (!user) {
      throw new NotFoundError('User not found');
    }
    
    user.metadata.set('verificationToken', hashedToken);
    user.metadata.set('verificationExpires', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
    
    await user.save();
    
    return token;
  }
  
  /**
   * Verify email using token
   * @param token Verification token
   */
  async verifyEmail(token: string): Promise<void> {
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
    
    const user = await User.findOne({
      'metadata.verificationToken': hashedToken,
      'metadata.verificationExpires': { $gt: new Date().toISOString() }
    });
    
    if (!user) {
      throw new BadRequestError('Invalid or expired verification token');
    }
    
    user.status = UserStatus.ACTIVE;
    
    user.metadata.delete('verificationToken');
    user.metadata.delete('verificationExpires');
    
    await user.save();
    
    authLogger.info(`Email verified for user: ${user._id}`, { 
      userId: user._id.toString() 
    });
  }
  
  /**
   * Generate JWT access and refresh tokens
   * @param user User document
   * @returns Generated tokens and expiry timestamp
   */
  private generateTokens(user: IUser): { token: string; refreshToken: string; tokenExpires: number } {
    let permissions: string[] = [];
    
    if (user.role === UserRole.USER) {
      permissions = [
        'view:account',
        'create:account',
        'view:transaction',
        'create:deposit',
        'create:withdrawal',
        'create:transfer'
      ];
    }
    
    if (user.role === UserRole.ADMIN) {
      permissions = [
        'view:account',
        'create:account',
        'update:account',
        'delete:account',
        'view:transaction',
        'create:deposit',
        'create:withdrawal',
        'create:transfer',
        'manage:users',
        'view:audit-logs'
      ];
    }
    
    const payload = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      permissions
    };
    
    const expiresIn = parseInt(jwtConfig.accessExpiresIn.replace(/[^0-9]/g, ''), 10);
    const tokenExpires = Math.floor(Date.now() / 1000) + expiresIn * (
      jwtConfig.accessExpiresIn.includes('h') ? 3600 : 
      jwtConfig.accessExpiresIn.includes('m') ? 60 : 1
    );
    
    const signOptions: SignOptions = {
        expiresIn: parseInt(jwtConfig.accessExpiresIn),
      issuer: jwtConfig.issuer,
      audience: jwtConfig.audience
    };
    
    const token = jwt.sign(
      payload, 
      jwtConfig.secret, 
      signOptions
    );
    
    const refreshSignOptions: SignOptions = {
      expiresIn: parseInt(jwtConfig.refreshExpiresIn),
      issuer: jwtConfig.issuer,
      audience: jwtConfig.audience
    };
    
    const refreshToken = jwt.sign(
      { id: user._id.toString() },
      jwtConfig.refreshSecret,
      refreshSignOptions
    );
    
    return { token, refreshToken, tokenExpires };
  }
  
  /**
   * Check if a new password was used before
   * @param newPassword New password to check
   * @param previousPasswordHashes Array of previous password hashes
   * @returns Boolean indicating if password was used before
   */
  private async checkIfPasswordWasUsedBefore(
    newPassword: string, 
    previousPasswordHashes: string[]
  ): Promise<boolean> {
    for (const hash of previousPasswordHashes) {
      const isMatch = await verifyPassword(newPassword, hash);
      if (isMatch) {
        return true;
      }
    }
    return false;
  }
  
  /**
   * Search users by criteria
   * @param search Search term (name or email)
   * @param status User status filter
   * @param role User role filter
   * @param page Page number
   * @param limit Items per page
   * @returns Array of matching users
   */
  async searchUsers(
    search?: string,
    status?: UserStatus,
    role?: UserRole,
    page: number = 1,
    limit: number = 10
  ): Promise<{ users: UserResponseDTO[], total: number }> {
    const query: any = {};
    
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { email: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex }
      ];
    }
    
    if (status) {
      query.status = status;
    }
    
    if (role) {
      query.role = role;
    }
    
    const skip = (page - 1) * limit;
    
    const [users, total] = await Promise.all([
      User.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(query)
    ]);
    
    return {
      users: users.map(user => this.mapUserToResponseDTO(user)),
      total
    };
  }
  
  /**
   * Map user document to basic DTO
   * @param user User document
   * @returns User DTO
   */
  private mapUserToResponseDTO(user: IUser): UserResponseDTO {
    return {
      id: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLogin: user.lastLogin || undefined
    };
  }
  
  /**
   * Map user document to detailed DTO
   * @param user User document
   * @returns Detailed user DTO
   */
  private mapUserToDetailedResponseDTO(user: IUser): UserDetailedResponseDTO {
    const metadata: Record<string, any> = {};
    user.metadata.forEach((value, key) => {
      if (key !== 'passwordResetToken' && 
          key !== 'passwordResetExpires' && 
          key !== 'verificationToken' &&
          key !== 'verificationExpires') {
        metadata[key] = value;
      }
    });
    
    return {
      ...this.mapUserToResponseDTO(user),
      contact: user.contact,
      notifications: user.notifications,
      dateOfBirth: user.dateOfBirth,
      metadata
    };
  }
}

export default new UserService();