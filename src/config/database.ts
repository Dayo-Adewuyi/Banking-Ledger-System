// src/config/database.ts
import mongoose from 'mongoose';
import { logger } from '../utils/logger';

interface DatabaseConfig {
  uri: string;
  options: mongoose.ConnectOptions;
}

const dbConfig: DatabaseConfig = {
  uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/banking-ledger',
  options: {
    minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE || '5', 10),
    maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE || '100', 10),
    
    connectTimeoutMS: parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '30000', 10),
    socketTimeoutMS: parseInt(process.env.DB_SOCKET_TIMEOUT_MS || '45000', 10),
    
    autoCreate: process.env.NODE_ENV !== 'production',
    
    ssl: process.env.NODE_ENV === 'production',
    
    waitQueueTimeoutMS: parseInt(process.env.DB_QUEUE_TIMEOUT_MS || '10000', 10)
  }
};

/**
 * Connect to MongoDB with  error handling and retry mechanism
 */
export const connectDatabase = async (): Promise<void> => {
  try {
    mongoose.set('debug', process.env.NODE_ENV === 'development');
    
    await mongoose.connect(dbConfig.uri, dbConfig.options);
    
    logger.info('MongoDB connection established successfully');
    
    setupConnectionMonitoring();
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    
    if (process.env.NODE_ENV === 'production') {
      logger.error('Could not connect to MongoDB. Exiting process...');
      process.exit(1);
    } else {
      logger.warn('Retrying MongoDB connection in 5 seconds...');
      setTimeout(connectDatabase, 5000);
    }
  }
};

/**
 * Monitor MongoDB connection for issues
 */
const setupConnectionMonitoring = () => {
  const connection = mongoose.connection;
  
  connection.on('error', (err) => {
    logger.error('MongoDB connection error:', err);
  });
  
  connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected. Attempting to reconnect...');
  });
  
  connection.on('reconnected', () => {
    logger.info('MongoDB reconnected successfully');
  });
  
  process.on('SIGINT', async () => {
    try {
      await connection.close();
      logger.info('MongoDB connection closed due to application termination');
      process.exit(0);
    } catch (err) {
      logger.error('Error during MongoDB connection close:', err);
      process.exit(1);
    }
  });
};

/**
 * Create a MongoDB transaction session
 * @returns Mongoose client session for transaction
 */
export const createTransactionSession = async (): Promise<mongoose.ClientSession> => {
  const session = await mongoose.startSession();
  session.startTransaction();
  return session;
};

/**
 * Commit a MongoDB transaction
 * @param session Mongoose client session
 */
export const commitTransaction = async (session: mongoose.ClientSession): Promise<void> => {
  await session.commitTransaction();
  session.endSession();
};

/**
 * Abort a MongoDB transaction
 * @param session Mongoose client session
 */
export const abortTransaction = async (session: mongoose.ClientSession): Promise<void> => {
  await session.abortTransaction();
  session.endSession();
};

export default {
  connectDatabase,
  createTransactionSession,
  commitTransaction,
  abortTransaction
};