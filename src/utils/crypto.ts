
import crypto from 'crypto';
import { promisify } from 'util';
import { appConfig } from '../config';

const ENCRYPTION_KEY = appConfig.encryptionKey
const ENCRYPTION_IV = appConfig.encryptionIv
const HASH_SECRET = appConfig.hash

if (Buffer.from(ENCRYPTION_KEY).length !== 32 && process.env.NODE_ENV === 'production') {
  throw new Error('ENCRYPTION_KEY must be 32 bytes (256 bits) for AES-256 encryption');
}

if (Buffer.from(ENCRYPTION_IV).length !== 16 && process.env.NODE_ENV === 'production') {
  throw new Error('ENCRYPTION_IV must be 16 bytes (128 bits) for AES encryption');
}

/**
 * Generate a secure random token
 * @param bytes Number of bytes for the token
 * @returns Hexadecimal string representation of the token
 */
export const generateSecureToken = (bytes: number = 32): string => {
  return crypto.randomBytes(bytes).toString('hex');
};

/**
 * Generate a unique account number for a new account
 * Format: ACCT-XXXX-XXXX-XXXX
 */
export const generateAccountNumber = (): string => {
  const randomPart = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `ACCT-${randomPart.slice(0, 4)}-${randomPart.slice(4, 8)}-${randomPart.slice(8, 12)}`;
};

/**
 * Generate a unique transaction ID
 * @param prefix Prefix for the transaction ID (e.g., 'DEP', 'WDR', 'TRF')
 * @returns Transaction ID in format PREFIX-XXXXXXXX-XXXX
 */
export const generateTransactionId = (prefix: string = 'TXN'): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
};

/**
 * Encrypt sensitive data
 * @param data Data to encrypt
 * @returns Encrypted data as base64 string
 */
export const encrypt = (data: string): string => {
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    Buffer.from(ENCRYPTION_KEY),
    Buffer.from(ENCRYPTION_IV)
  );
  
  let encrypted = cipher.update(data, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  return encrypted;
};

/**
 * Decrypt sensitive data
 * @param encryptedData Encrypted data as base64 string
 * @returns Decrypted data
 */
export const decrypt = (encryptedData: string): string => {
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    Buffer.from(ENCRYPTION_KEY),
    Buffer.from(ENCRYPTION_IV)
  );
  
  let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
};

/**
 * Create an HMAC signature for data integrity verification
 * @param data Data to sign
 * @returns HMAC signature as hex string
 */
export const createHmacSignature = (data: string): string => {
  return crypto
    .createHmac('sha256', HASH_SECRET)
    .update(data)
    .digest('hex');
};

/**
 * Verify HMAC signature for data integrity
 * @param data Original data
 * @param signature HMAC signature to verify
 * @returns Boolean indicating if signature is valid
 */
export const verifyHmacSignature = (data: string, signature: string): boolean => {
  const computedSignature = createHmacSignature(data);
  return crypto.timingSafeEqual(
    Buffer.from(computedSignature, 'hex'),
    Buffer.from(signature, 'hex')
  );
};

/**
 * Create a secure password hash
 * @param password Plain text password
 * @returns Password hash
 */
export const hashPassword = async (password: string): Promise<string> => {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await promisify(crypto.scrypt)(password, salt, 64) as Buffer;
  
  return `${salt}:${derivedKey.toString('hex')}`;
};

/**
 * Verify a password against a hash
 * @param password Plain text password
 * @param hash Password hash
 * @returns Boolean indicating if password is valid
 */
export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  const [salt, key] = hash.split(':');
  const derivedKey = await promisify(crypto.scrypt)(password, salt, 64) as Buffer;
  
  return key === derivedKey.toString('hex');
};

/**
 * Generate a secure random number within a range
 * @param min Minimum value (inclusive)
 * @param max Maximum value (inclusive)
 * @returns Random number within the specified range
 */
export const secureRandomInt = (min: number, max: number): number => {
  min = Math.ceil(min);
  max = Math.floor(max);
  
  const range = max - min + 1;
  
  const bytes = crypto.randomBytes(4);
  const randomValue = bytes.readUInt32BE(0) / (0xffffffff + 1);
  
  return Math.floor(randomValue * range) + min;
};

export default {
  generateSecureToken,
  generateAccountNumber,
  generateTransactionId,
  encrypt,
  decrypt,
  createHmacSignature,
  verifyHmacSignature,
  hashPassword,
  verifyPassword,
  secureRandomInt
};