import { body, param, query, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { Decimal } from 'decimal.js';
import { passwordPolicy } from '../config/auth';
import { CurrencyCode, AccountType } from '../interfaces';
import { logger } from './logger';
import { ApiError } from './errors';

/**
 * Validate request data against Express-validator rules
 */
export const validate = (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }
  
    logger.debug('Validation errors', { errors: errors.array() });
  
    const formattedErrors = errors.array().map((err) => ({
      field: (err as any).param ?? 'unknown', 
      message: err.msg,
      value: (err as any).value ?? 'N/A' 
    }));
  
    throw new ApiError(400, 'Validation Error', formattedErrors);
  };

/**
 * Sanitize and validate the amount for financial transactions
 * Using precise Decimal.js for accurate financial calculations
 */
export const validateAmount = (value: any): boolean => {
  try {
    if (value === undefined || value === null) return false;
    
    const amount = new Decimal(value);
    
    if (amount.isNegative() || amount.isZero()) return false;
    
    if (amount.decimalPlaces() > 2) return false;
 
    if (amount.greaterThan(new Decimal('100000000000'))) return false;
    
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Validate account number format
 */
export const validateAccountNumber = (value: string): boolean => {
  const accountNumberRegex = /^ACCT-[0-9A-Za-z]{4}-[0-9A-Za-z]{4}-[0-9A-Za-z]{4}$/;
  return accountNumberRegex.test(value);
};

/**
 * Validate ISO currency code
 */
export const validateCurrency = (value: string): boolean => {
  return Object.values(CurrencyCode).includes(value as CurrencyCode);
};

/**
 * Validate account type
 */
export const validateAccountType = (value: string): boolean => {
  return Object.values(AccountType).includes(value as AccountType);
};

/**
 * Validate email format
 */
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return emailRegex.test(email);
};

/**
 * Password strength validation
 */
export const validatePassword = (password: string): { valid: boolean; message?: string } => {
  if (!password || password.length < passwordPolicy.minLength) {
    return { valid: false, message: `Password must be at least ${passwordPolicy.minLength} characters long` };
  }
  
  if (passwordPolicy.requireUppercase && !/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  
  if (passwordPolicy.requireLowercase && !/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  
  if (passwordPolicy.requireNumbers && !/\d/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  
  if (passwordPolicy.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one special character' };
  }
  

  const commonPatterns = [
    /^123456/,
    /^password/i,
    /^qwerty/i,
    /^admin/i,
    /^welcome/i
  ];
  
  for (const pattern of commonPatterns) {
    if (pattern.test(password)) {
      return { valid: false, message: 'Password contains a common pattern and is too weak' };
    }
  }
  
  return { valid: true };
};

/**
 * UUID validation
 */
export const validateUUID = (value: string): boolean => {
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
  return uuidRegex.test(value);
};

/**
 * Date range validation
 */
export const validateDateRange = (startDate: Date, endDate: Date): boolean => {
  if (!(startDate instanceof Date) || !(endDate instanceof Date)) {
    return false;
  }
  
  return startDate <= endDate;
};

/**
 * Standard validation rules for common fields
 */
export const validationRules = {
  auth: {
    login: [
      body('email').isEmail().withMessage('Please provide a valid email address'),
      body('password').notEmpty().withMessage('Password is required')
    ],
    
    register: [
      body('email').isEmail().withMessage('Please provide a valid email address')
        .normalizeEmail(),
      body('password').isLength({ min: passwordPolicy.minLength })
        .withMessage(`Password must be at least ${passwordPolicy.minLength} characters long`)
        .custom((value) => {
          const result = validatePassword(value);
          if (!result.valid) {
            throw new Error(result.message);
          }
          return true;
        }),
      body('firstName').trim().notEmpty().withMessage('First name is required'),
      body('lastName').trim().notEmpty().withMessage('Last name is required'),
    ],
    
    refreshToken: [
      body('refreshToken').notEmpty().withMessage('Refresh token is required')
    ]
  },
  
  account: {
    create: [
      body('accountType').isIn(Object.values(AccountType))
        .withMessage('Invalid account type'),
      body('currency').isIn(Object.values(CurrencyCode))
        .withMessage('Invalid currency code'),
      body('name').trim().notEmpty().withMessage('Account name is required')
        .isLength({ max: 100 }).withMessage('Account name cannot exceed 100 characters'),
      body('initialBalance').optional().isNumeric()
        .withMessage('Initial balance must be a number')
        .custom(validateAmount).withMessage('Invalid amount format')
    ],
    
    getById: [
      param('id').isMongoId().withMessage('Invalid account ID format')
    ],
    
    getByAccountNumber: [
      param('accountNumber').custom(validateAccountNumber)
        .withMessage('Invalid account number format')
    ],
    
    update: [
      param('id').isMongoId().withMessage('Invalid account ID format'),
      body('name').optional().trim().notEmpty().withMessage('Account name cannot be empty')
        .isLength({ max: 100 }).withMessage('Account name cannot exceed 100 characters'),
      body('status').optional().isIn(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'CLOSED'])
        .withMessage('Invalid account status')
    ],
    
    list: [
      query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
      query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
      query('accountType').optional().isIn(Object.values(AccountType))
        .withMessage('Invalid account type'),
      query('currency').optional().isIn(Object.values(CurrencyCode))
        .withMessage('Invalid currency code'),
      query('status').optional().isIn(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'CLOSED'])
        .withMessage('Invalid account status')
    ]
  },
 
  transaction: {
    deposit: [
      body('accountNumber').custom(validateAccountNumber)
        .withMessage('Invalid account number format'),
      body('amount').isNumeric().withMessage('Amount must be a number')
        .custom(validateAmount).withMessage('Invalid amount format'),
      body('currency').isIn(Object.values(CurrencyCode))
        .withMessage('Invalid currency code'),
      body('description').optional().trim().isLength({ max: 255 })
        .withMessage('Description cannot exceed 255 characters')
    ],
    
    withdrawal: [
      body('accountNumber').custom(validateAccountNumber)
        .withMessage('Invalid account number format'),
      body('amount').isNumeric().withMessage('Amount must be a number')
        .custom(validateAmount).withMessage('Invalid amount format'),
      body('currency').isIn(Object.values(CurrencyCode))
        .withMessage('Invalid currency code'),
      body('description').optional().trim().isLength({ max: 255 })
        .withMessage('Description cannot exceed 255 characters')
    ],
    
    transfer: [
      body('fromAccountNumber').custom(validateAccountNumber)
        .withMessage('Invalid source account number format'),
      body('toAccountNumber').custom(validateAccountNumber)
        .withMessage('Invalid destination account number format')
        .custom((value, { req }) => {
          if (value === req.body.fromAccountNumber) {
            throw new Error('Source and destination accounts cannot be the same');
          }
          return true;
        }),
      body('amount').isNumeric().withMessage('Amount must be a number')
        .custom(validateAmount).withMessage('Invalid amount format'),
      body('currency').isIn(Object.values(CurrencyCode))
        .withMessage('Invalid currency code'),
      body('description').optional().trim().isLength({ max: 255 })
        .withMessage('Description cannot exceed 255 characters')
    ],
    
    getById: [
      param('id').isMongoId().withMessage('Invalid transaction ID format')
    ],
    
    getByTransactionId: [
      param('transactionId').isString().withMessage('Invalid transaction ID format')
    ],
    
    list: [
      query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
      query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
      query('fromDate').optional().isISO8601().withMessage('Invalid from date format'),
      query('toDate').optional().isISO8601().withMessage('Invalid to date format'),
      query('accountNumber').optional().custom(validateAccountNumber)
        .withMessage('Invalid account number format'),
      query('transactionType').optional()
        .isIn(['DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'PAYMENT', 'FEE', 'INTEREST', 'ADJUSTMENT'])
        .withMessage('Invalid transaction type'),
      query('status').optional()
        .isIn(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERSED', 'CANCELLED'])
        .withMessage('Invalid transaction status')
    ]
  }
};

/**
 * Joi schema for validating financial data
 */
export const financialSchemas = {
  amount: Joi.number().precision(2).positive().required(),
  currency: Joi.string().valid(...Object.values(CurrencyCode)).required(),
  accountNumber: Joi.string().pattern(/^ACCT-\d{4}-\d{4}-\d{4}$/).required(),
  
  depositSchema: Joi.object({
    accountNumber: Joi.string().pattern(/^ACCT-\d{4}-\d{4}-\d{4}$/).required(),
    amount: Joi.number().precision(2).positive().required(),
    currency: Joi.string().valid(...Object.values(CurrencyCode)).required(),
    description: Joi.string().max(255).optional(),
    reference: Joi.string().max(50).optional(),
    metadata: Joi.object().optional()
  }),
  
  withdrawalSchema: Joi.object({
    accountNumber: Joi.string().pattern(/^ACCT-\d{4}-\d{4}-\d{4}$/).required(),
    amount: Joi.number().precision(2).positive().required(),
    currency: Joi.string().valid(...Object.values(CurrencyCode)).required(),
    description: Joi.string().max(255).optional(),
    reference: Joi.string().max(50).optional(),
    metadata: Joi.object().optional()
  }),
  
  transferSchema: Joi.object({
    fromAccountNumber: Joi.string().pattern(/^ACCT-\d{4}-\d{4}-\d{4}$/).required(),
    toAccountNumber: Joi.string().pattern(/^ACCT-\d{4}-\d{4}-\d{4}$/).required(),
    amount: Joi.number().precision(2).positive().required(),
    currency: Joi.string().valid(...Object.values(CurrencyCode)).required(),
    description: Joi.string().max(255).optional(),
    reference: Joi.string().max(50).optional(),
    metadata: Joi.object().optional()
  }).custom((value, helpers) => {
    if (value.fromAccountNumber === value.toAccountNumber) {
      return helpers.error('any.invalid', { 
        message: 'Source and destination accounts cannot be the same' 
      });
    }
    return value;
  })
};

export default {
  validate,
  validateAmount,
  validateAccountNumber,
  validateCurrency,
  validateAccountType,
  validateEmail,
  validatePassword,
  validateUUID,
  validateDateRange,
  validationRules,
  financialSchemas
};