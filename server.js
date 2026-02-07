const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const logger = require("./utils/logger");
const requestTimeout = require("./middleware/timeout");
const {
  validateEnvironment,
  getEnvironmentInfo,
} = require("./utils/envValidator");
require("dotenv").config();

// =====================================================
// VALIDATE ENVIRONMENT BEFORE STARTING
// =====================================================
try {
  validateEnvironment();
} catch (error) {
  console.error("❌ Environment validation failed:", error.message);
  console.error(
    "💡 Please check your .env file and ensure all required variables are set",
  );
  process.exit(1);
}

const authRoutes = require("./routes/authRoutes");
const certificateRoutes = require("./routes/certificateRoutes");
const certificateLogsRoutes = require("./routes/certificateLogsRoutes");
const userRoutes = require("./routes/userRoutes");
const teacherRoutes = require("./routes/teacherRoutes");
const moduleRoutes = require("./routes/moduleRoutes");
const printedCertificatesRoutes = require("./routes/printedCertificates");
const exportRoutes = require("./routes/exportRoutes");

const app = express();

// =====================================================
// SECURITY MIDDLEWARE
// =====================================================

// Helmet - Security headers
app.use(helmet());

// =====================================================
// REQUEST TIMEOUT MIDDLEWARE (30 seconds)
// =====================================================
app.use(requestTimeout(30000));

// =====================================================
// CORS CONFIGURATION
// =====================================================

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5500",
  "http://localhost:8080",
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else if (process.env.NODE_ENV === "development") {
      logger.warn(`⚠️  Warning: Allowing origin ${origin} in development mode`);
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
  ],
};

app.use(cors(corsOptions));

// =====================================================
// BODY PARSING MIDDLEWARE (with size limits)
// =====================================================

app.use(
  express.json({
    limit: "2mb",
    verify: (req, res, buf, encoding) => {
      if (buf.length > 2 * 1024 * 1024) {
        throw new Error("Request entity too large");
      }
    },
  }),
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "2mb",
    verify: (req, res, buf, encoding) => {
      if (buf.length > 2 * 1024 * 1024) {
        throw new Error("Request entity too large");
      }
    },
  }),
);

// =====================================================
// REQUEST LOGGING MIDDLEWARE
// =====================================================

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// =====================================================
// ROUTES
// =====================================================

app.use("/api/auth", authRoutes);
app.use("/api/certificates", certificateRoutes);
app.use("/api/logs", certificateLogsRoutes);
app.use("/api/users", userRoutes);
app.use("/api/teachers", teacherRoutes);
app.use("/api/modules", moduleRoutes);
app.use("/api/printed-certificates", printedCertificatesRoutes);
app.use("/api/export", exportRoutes);

// =====================================================
// ROOT & HEALTH CHECK
// =====================================================

app.get("/", (req, res) => {
  res.json({
    message: "Certificate Management API is running",
    version: "2.5.0",
    environment: process.env.NODE_ENV || "development",
    endpoints: {
      auth: "/api/auth",
      certificates: "/api/certificates",
      logs: "/api/logs",
      users: "/api/users",
      teachers: "/api/teachers",
      modules: "/api/modules",
      printedCertificates: "/api/printed-certificates",
      export: "/api/export",
    },
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: getEnvironmentInfo(),
  });
});

// =====================================================
// ERROR HANDLING
// =====================================================

// Body-parser error handler
app.use((err, req, res, next) => {
  if (
    err.type === "entity.too.large" ||
    err.message === "Request entity too large"
  ) {
    logger.warn(`Request too large: ${req.method} ${req.path}`, {
      ip: req.ip,
      size: req.headers["content-length"],
    });

    return res.status(413).json({
      success: false,
      message: "Request body too large. Maximum size is 2MB.",
      errorCode: "PAYLOAD_TOO_LARGE",
      maxSize: "2MB",
    });
  }

  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    logger.warn(`Invalid JSON: ${req.method} ${req.path}`, {
      ip: req.ip,
      error: err.message,
    });

    return res.status(400).json({
      success: false,
      message: "Invalid JSON in request body",
      errorCode: "INVALID_JSON",
    });
  }

  next(err);
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint not found",
    path: req.path,
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  logger.error("Server Error:", err);

  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({
      success: false,
      message: "CORS policy violation",
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
    error: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
});

// =====================================================
// START SERVER
// =====================================================

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  const envInfo = getEnvironmentInfo();
  logger.info("=".repeat(50));
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📝 Environment: ${envInfo.nodeEnv}`);
  logger.info(`🔗 API: http://localhost:${PORT}`);
  logger.info(`📊 Summary: http://localhost:${PORT}/api/certificates/summary`);
  logger.info(`👥 Teachers: http://localhost:${PORT}/api/teachers`);
  logger.info(`📚 Modules: http://localhost:${PORT}/api/modules`);
  logger.info(
    `📜 Printed Certificates: http://localhost:${PORT}/api/printed-certificates`,
  );
  logger.info(`📥 Export Data: http://localhost:${PORT}/api/export`);
  logger.info(
    `🔄 Refresh Token: http://localhost:${PORT}/api/auth/refresh-token`,
  );
  logger.info("=".repeat(50));
});

// =====================================================
// GRACEFUL SHUTDOWN
// =====================================================

process.on("SIGTERM", () => {
  logger.info("SIGTERM signal received: closing HTTP server");
  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  logger.info("SIGINT signal received: closing HTTP server");
  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
});

module.exports = app;
