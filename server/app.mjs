import path from "path";
import schedule from "node-schedule";
import connectDB, { connectionCleanup } from "./connectDb.mjs";
import configureApp from "./config/appConfig.mjs";
import { startWorker } from "./utils/startWorker.mjs";
import updateEmployeeStatus from "./utils/updateEmployeeStatus.mjs";
import createNotificationWorker from "./workers/notificationWorker.mjs";
import cluster from "cluster";
import os from "os";

// CRON Jobs
import runDatabaseBackup from "./utils/runDatabaseBackup.mjs";
import runESLint from "./utils/runESLint.mjs";

// Routes
import generalRoutes from "./routes/generalRoutes.mjs";
import analyticsRoute from "./routes/analyticsRoute.mjs";
import authRoutes from "./routes/authRoutes.mjs";
import webauthnRoutes from "./routes/webauthnRoutes.mjs";
import pushNotificationRoutes from "./routes/pushNotificationRoutes.mjs";
import userRoutes from "./routes/userRoutes.mjs";
import appraisalRoutes from "./routes/appraisalRoutes.mjs";
import trainingRoutes from "./routes/trainingRoutes.mjs";
import hrActivityRoutes from "./routes/hrActivityRoutes.mjs";
import recruitmentRoutes from "./routes/recruitmentRoutes.mjs";
import attendanceRoutes from "./routes/attendanceRoutes.mjs";
import kycRoutes from "./routes/kycRoutes.mjs";
import employeeManagamentRoutes from "./routes/employeeManagementRoutes.mjs";
import resignationRoutes from "./routes/resignationRoutes.mjs";
import permissionsRoute from "./routes/permissionsRoute.mjs";
import salaryManagementRoute from "./routes/salaryManagementRoute.mjs";
import fileUploadRoute from "./routes/fileUploadRoute.mjs";

// Global error handlers
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

// Store workers and adapters for graceful shutdown
let notificationWorker = null;
let redisAdapter = null;

const numCPUs = os.cpus().length;

// Add shutdown flag to prevent worker restart during shutdown
let isShuttingDown = false;

// Cluster setup for multi-core processing
if (cluster.isPrimary) {
  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    // Only restart workers if not shutting down
    if (!isShuttingDown) {
      cluster.fork();
    }
  });

  // Handle graceful shutdown for primary process
  const shutdownPrimary = async () => {
    if (isShuttingDown) return; // Prevent multiple shutdown calls

    isShuttingDown = true;
    console.log("Primary process shutting down...");

    // Send shutdown signal to all workers
    const workers = Object.values(cluster.workers);

    for (const worker of workers) {
      if (worker) {
        worker.send("shutdown");
      }
    }

    // Wait for workers to shut down gracefully
    const waitForWorkers = new Promise((resolve) => {
      let workersShutdown = 0;
      const totalWorkers = workers.length;

      if (totalWorkers === 0) {
        resolve();
        return;
      }

      const checkAllWorkersDown = () => {
        workersShutdown++;
        if (workersShutdown >= totalWorkers) {
          resolve();
        }
      };

      // Listen for worker exit events
      workers.forEach((worker) => {
        if (worker) {
          worker.on("exit", checkAllWorkersDown);
        } else {
          checkAllWorkersDown();
        }
      });
    });

    // Wait for graceful shutdown or timeout
    const shutdownTimeout = new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, 8000);
    });

    await Promise.race([waitForWorkers, shutdownTimeout]);

    // Force kill any remaining workers
    for (const worker of workers) {
      if (worker && !worker.isDead()) {
        worker.kill("SIGKILL");
      }
    }

    process.exit(0);
  };

  process.on("SIGTERM", shutdownPrimary);
  process.on("SIGINT", shutdownPrimary);
} else {
  const startApplication = async () => {
    try {
      await connectDB();
      connectionCleanup();

      // Configure app and get server, io, redisAdapter instances
      const { app, server, io, redisAdapter: adapter } = configureApp();
      redisAdapter = adapter;

      // Start existing worker threads (resume parsing, email, DB watch)
      try {
        startWorker(path.resolve("./workers/emailWorker.mjs"));
        startWorker(path.resolve("./workers/watchUserChanges.mjs"));
        notificationWorker = createNotificationWorker(io, redisAdapter);
      } catch (workerError) {
        console.error("Error starting worker threads:", workerError);
      }

      // Routes
      app.use(generalRoutes);
      app.use(analyticsRoute);
      app.use(authRoutes);
      app.use(webauthnRoutes);
      app.use(userRoutes);
      app.use(pushNotificationRoutes);
      app.use(appraisalRoutes);
      app.use(trainingRoutes);
      app.use(hrActivityRoutes);
      app.use(recruitmentRoutes);
      app.use(attendanceRoutes);
      app.use(kycRoutes);
      app.use(employeeManagamentRoutes);
      app.use(resignationRoutes);
      app.use(permissionsRoute);
      app.use(salaryManagementRoute);
      app.use(fileUploadRoute);

      // Start the server
      const PORT = process.env.PORT || 9002;
      server.listen(PORT, () => {
        const protocol = app.get("useHttps") ? "HTTPS" : "HTTP";
        console.log(
          `Worker ${process.pid} - Server running on ${protocol} port ${PORT}`
        );
      });

      // Only run scheduled tasks on the first worker to avoid duplication
      if (cluster.worker.id === 1) {
        // Scheduled tasks
        schedule.scheduleJob("0 0 * * *", async () => {
          await updateEmployeeStatus();
        });

        schedule.scheduleJob("0 8 * * *", async () => {
          await runESLint();
        });

        schedule.scheduleJob("0 * * * *", async () => {
          await runDatabaseBackup();
        });
      }

      // Graceful shutdown handling for workers
      const gracefulShutdown = async () => {
        try {
          // Cancel all scheduled jobs for this worker
          schedule.gracefulShutdown();

          // Close BullMQ worker
          if (notificationWorker) {
            await notificationWorker.close();
          }

          // Cleanup Redis adapter
          if (redisAdapter) {
            await redisAdapter.cleanup();
          }

          // Close database connection
          await connectionCleanup();

          // Close server
          server.close(() => {
            process.exit(0);
          });

          // Force exit after 25 seconds (less than primary timeout)
          setTimeout(() => {
            process.exit(1);
          }, 25000);
        } catch (error) {
          console.error(
            `Worker ${process.pid} - Error during graceful shutdown:`,
            error
          );
          process.exit(1);
        }
      };

      // Handle shutdown signals
      process.on("SIGTERM", gracefulShutdown);
      process.on("SIGINT", gracefulShutdown);

      // Handle shutdown message from primary
      process.on("message", (msg) => {
        if (msg === "shutdown") {
          gracefulShutdown();
        }
      });
    } catch (error) {
      console.error(
        `Worker ${process.pid} - Application initialization error:`,
        error
      );
      process.exit(1);
    }
  };

  // Start application
  startApplication();
}
