import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface AppConfig {
  env: string;
  name: string;
  host: string;
  port: number;
  apiVersion: string;
  apiPrefix: string;
  corsOrigins: string[];
  logLevel: string;
  clientUrl: string;
  encryptionKey: string;
  encryptionIv: string;
  hash: string
}

export const appConfig: AppConfig = {
  env: process.env.NODE_ENV || 'development',
  name: process.env.APP_NAME || 'Banking Ledger API',
  host: process.env.HOST || '0.0.0.0',
  port: parseInt(process.env.PORT || '3000', 10),
  apiVersion: process.env.API_VERSION || 'v1',
  apiPrefix: process.env.API_PREFIX || '/api',
  corsOrigins: process.env.CORS_ORIGINS 
    ? process.env.CORS_ORIGINS.split(',') 
    : ['http://localhost:3000', 'http://localhost:8080'],
  logLevel: process.env.LOG_LEVEL || 'info',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
  encryptionKey: process.env.ENCRYPTION_KEY || 'this-is-a-32-byte-dev-encryption-key',
    encryptionIv: process.env.ENCRYPTION_IV || 'this-is-a-16-byte-iv',
hash: process.env.HASH_SECRET || 'banking-ledger-hash-secret'
};

export const getFullApiPrefix = (): string => {
  return `${appConfig.apiPrefix}/${appConfig.apiVersion}`;
};

export const isProduction = (): boolean => {
  return appConfig.env === 'production';
};

export const isDevelopment = (): boolean => {
  return appConfig.env === 'development';
};

export const isTest = (): boolean => {
  return appConfig.env === 'test';
};

export { default as database } from './database';
export { default as auth } from './auth';

export default {
  app: appConfig,
  getFullApiPrefix,
  isProduction,
  isDevelopment,
  isTest,
  database: require('./database').default,
  auth: require('./auth').default
};