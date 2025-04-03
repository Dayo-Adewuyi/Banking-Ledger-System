import express, { Router } from 'express';
import { getFullApiPrefix } from '../config';
import authRoutes from './auth.routes';
import accountRoutes from './account.routes';
import transactionRoutes from './transaction.routes';
import { performanceMiddleware, errorMiddleware } from '../middlewares';

/**
 * Main router that combines all application routes
 * with global middleware and error handling
 */
const router = Router();

const apiPrefix = getFullApiPrefix();

router.use(performanceMiddleware.etagCache());

router.use(`${apiPrefix}/auth`, authRoutes);
router.use(`${apiPrefix}/accounts`, accountRoutes);
router.use(`${apiPrefix}/transactions`, transactionRoutes);

router.get(`${apiPrefix}`, (req, res) => {
  res.json({
    name: 'Banking Ledger API',
    version: process.env.npm_package_version || '1.0.0',
    status: 'operational',
  });
});

router.all(`${apiPrefix}/*`, errorMiddleware.notFoundHandler);

export default router;