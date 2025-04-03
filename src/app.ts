import express, { Application, Request, Response, NextFunction } from "express";
import helmet from "helmet";
import morgan from "morgan";
import cors from "cors";
import passport from "passport";
import compression from "compression";
import { Strategy as JwtStrategy } from "passport-jwt";
import actuator from "express-actuator";
import mongoSanitize from "express-mongo-sanitize";
import hpp from "hpp";
import router from "./routes";
import { appConfig, auth, getFullApiPrefix } from "./config";

import {
  errorMiddleware,
  securityMiddleware,
  loggingMiddleware,
  authMiddleware,
  performanceMiddleware,
} from "./middlewares";

import { logger } from "./utils/logger";

class App {
  public app: Application;

  constructor() {
    this.app = express();
    this.configureMiddleware();
    this.configureRoutes();
    this.configureErrorHandling();
  }

  /**
   * Configure application middleware
   */
  private configureMiddleware(): void {
    this.app.use(performanceMiddleware.compressResponses());

    this.app.use(helmet());
    this.app.use(
      cors({
        origin: appConfig.corsOrigins,
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
        allowedHeaders: ["Content-Type", "Authorization"],
        credentials: true,
      })
    );

    this.app.use(securityMiddleware.addRequestId());

    this.app.use(express.json({ limit: "10kb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "10kb" }));

    this.app.use(mongoSanitize());
    this.app.use(hpp());

    if (appConfig.env === "development") {
      this.app.use(morgan("dev"));
    } else {
      this.app.use(loggingMiddleware.requestLogger());
    }

    this.app.use(compression());

    this.app.use(
      actuator({
        basePath: "/management",
        infoGitMode: "simple",
        infoBuildOptions: {
          app: {
            name: appConfig.name,
            version: process.env.npm_package_version,
            description: "Banking Ledger API",
            environment: appConfig.env,
          },
        },
      })
    );

    this.app.use(passport.initialize());

    passport.use(
      new JwtStrategy(auth.jwtOptions, authMiddleware.verifyCallback)
    );

    this.app.use(securityMiddleware.detectSuspiciousActivity());

    if (appConfig.env === "production") {
      this.app.use(securityMiddleware.generalRateLimiter);

      this.app.use(securityMiddleware.forceHttps());
    }

    this.app.use(loggingMiddleware.slowRequestLogger(1000));

    this.app.use(loggingMiddleware.auditLogger());
  }

  /**
   * Configure API routes
   */
  private configureRoutes(): void {
    const apiPrefix = getFullApiPrefix();

    this.app.get("/health", (req: Request, res: Response) => {
      res.status(200).json({
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
      });
    });

    this.app.get("/management/cache-stats", (req: Request, res: Response) => {
      const cacheInstance = performanceMiddleware.getCache();
      if (cacheInstance) {
        res.json({
          keys: cacheInstance.keys().length,
          stats: cacheInstance.getStats(),
          memoryUsage: process.memoryUsage(),
        });
      } else {
        res.json({
          error: "Cache instance not available",
          memoryUsage: process.memoryUsage(),
        });
      }
    });

    this.app.use(
      `${apiPrefix}/reference`,
      (req: Request, res: Response, next: NextFunction) => {
        performanceMiddleware.cacheResponse(
          performanceMiddleware.CACHE_TTLS.REFERENCE_DATA,
          "ref"
        )(req, res, next);
      }
    );

    this.app.use(router);

    this.app.all("*", errorMiddleware.notFoundHandler);
  }

  /**
   * Configure error handling
   */
  private configureErrorHandling(): void {
    this.app.use(errorMiddleware.errorHandler);

    this.app.use(errorMiddleware.handleUncaughtException);

    process.on("unhandledRejection", (reason: Error) => {
      logger.error("UNHANDLED REJECTION! 💥 Shutting down...", {
        error: reason.message,
        stack: reason.stack,
      });

      setTimeout(() => {
        process.exit(1);
      }, 1000);
    });

    process.on("SIGTERM", () => {
      logger.info("👋 SIGTERM RECEIVED. Shutting down gracefully");

      setTimeout(() => {
        process.exit(0);
      }, 1000);
    });
  }
}

export default new App().app;
