
import app from './app';
import { createServer } from 'http';
import { appConfig } from './config';
import { connectDatabase } from './config/database';
import { logger } from './utils/logger';
import cluster from 'cluster';
import os from 'os';
import { setupErrorHandlers } from './utils/errors';
import mongoose from 'mongoose';


const PRODUCTION_WORKER_COUNT = Math.min(os.cpus().length, 4);
const WORKER_COUNT = appConfig.env === 'production' ? PRODUCTION_WORKER_COUNT : 1;

const enableClustering = appConfig.env === 'production' && process.env.DISABLE_CLUSTERING !== 'true';

/**
 * Start the Express server
 */
async function startServer() {
  try {
    setupErrorHandlers();
    
    await connectDatabase();
    
    const server = createServer(app);
    
    server.timeout = 30000; 
    server.keepAliveTimeout = 65000; 
 
    server.listen(appConfig.port, () => {
      logger.info(`
      ================================================
      🚀 Server running in ${appConfig.env} mode
      📡 Listening on port ${appConfig.port}
      🔗 http://${appConfig.host}:${appConfig.port}
      ================================================
      `);
    });
    
    server.on('error', (error) => {
      logger.error('Server error', { error: error.message, stack: error.stack });
      process.exit(1);
    });
    
    const gracefulShutdown = async (signal: string) => {
      logger.info(`${signal} received. Shutting down gracefully...`);
      
      server.close(() => {
        logger.info('HTTP server closed');
        
        mongoose.connection.close(false)
          .then(() => {
            logger.info('MongoDB connection closed');
            process.exit(0);
          })
          .catch((err) => {
            logger.error('Error during MongoDB disconnect', { error: err.message });
            process.exit(1);
          });
      });
      
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };
    
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start server', { error: (error as Error).message });
    process.exit(1);
  }
}

if (enableClustering && cluster.isPrimary) {
  logger.info(`Master process ${process.pid} is running`);
  
  for (let i = 0; i < WORKER_COUNT; i++) {
    cluster.fork();
  }
  
  cluster.on('exit', (worker, code, signal) => {
    logger.warn(`Worker ${worker.process.pid} died with code ${code} and signal ${signal}`);
    logger.info('Starting a new worker');
    cluster.fork();
  });
  
  cluster.on('online', (worker) => {
    logger.info(`Worker ${worker.process.pid} is online`);
  });
} else {
  startServer();
}


export default app;