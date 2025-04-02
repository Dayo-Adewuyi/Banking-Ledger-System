import { ValidationChain } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { 
  validate, 
  validationRules, 
  financialSchemas 
} from '../utils/validators';

/**
 * Factory function to create validation middleware from validation rules
 * @param validations Array of express-validator ValidationChains
 */
export const validateRequest = (validations: ValidationChain[]) => {
  return [
    ...validations, 
    validate       
  ];
};

/**
 * Middleware that validates request against Joi schema
 * @param schema Joi schema to validate against
 * @param property Request property to validate ('body', 'query', 'params')
 */
export const validateSchema = (schema: Joi.Schema, property: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true
    });
    
    if (!error) {
      req[property] = value;
      return next();
    }
    
    const formattedErrors = error.details.map(err => ({
      field: err.path.join('.'),
      message: err.message,
      value: err.context?.value
    }));
    
    const error400 = new Error('Validation Error');
    (error400 as any).statusCode = 400;
    (error400 as any).details = formattedErrors;
    
    next(error400);
  };
};

/**
 * Common validation middleware for account operations
 */
export const accountValidation = {
  create: validateRequest(validationRules.account.create),
  getById: validateRequest(validationRules.account.getById),
  getByAccountNumber: validateRequest(validationRules.account.getByAccountNumber),
  update: validateRequest(validationRules.account.update),
  list: validateRequest(validationRules.account.list)
};

/**
 * Common validation middleware for transaction operations
 */
export const transactionValidation = {
  deposit: validateRequest(validationRules.transaction.deposit),
  withdrawal: validateRequest(validationRules.transaction.withdrawal),
  transfer: validateRequest(validationRules.transaction.transfer),
  getById: validateRequest(validationRules.transaction.getById),
  getByTransactionId: validateRequest(validationRules.transaction.getByTransactionId),
  list: validateRequest(validationRules.transaction.list),
  
  depositSchema: validateSchema(financialSchemas.depositSchema),
  withdrawalSchema: validateSchema(financialSchemas.withdrawalSchema),
  transferSchema: validateSchema(financialSchemas.transferSchema)
};

/**
 * Common validation middleware for auth operations
 */
export const authValidation = {
  login: validateRequest(validationRules.auth.login),
  register: validateRequest(validationRules.auth.register),
  refreshToken: validateRequest(validationRules.auth.refreshToken)
};

export default {
  validateRequest,
  validateSchema,
  accountValidation,
  transactionValidation,
  authValidation
};