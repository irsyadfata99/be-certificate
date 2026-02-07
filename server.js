const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const certificateRoutes = require("./routes/certificateRoutes");
const certificateLogsRoutes = require("./routes/certificateLogsRoutes");
const userRoutes = require("./routes/userRoutes");
const teacherRoutes = require("./routes/teacherRoutes");
const moduleRoutes = require("./routes/moduleRoutes");
const printedCertificatesRoutes = require("./routes/printedCertificates"); // ADDED

const app = express();

// =====================================================
// SECURITY MIDDLEWARE
// =====================================================

// Helmet - Security headers
app.use(helmet());

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
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else if (process.env.NODE_ENV === "development") {
      console.warn(
        `⚠️  Warning: Allowing origin ${origin} in development mode`,
      );
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

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// =====================================================
// REQUEST LOGGING MIDDLEWARE
// =====================================================

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
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
app.use("/api/printed-certificates", printedCertificatesRoutes); // ADDED

// =====================================================
// ROOT & HEALTH CHECK
// =====================================================

app.get("/", (req, res) => {
  res.json({
    message: "Certificate Management API is running",
    version: "2.3.0", // UPDATED VERSION
    environment: process.env.NODE_ENV || "development",
    endpoints: {
      auth: "/api/auth",
      certificates: "/api/certificates",
      summary: "/api/certificates/summary",
      history: "/api/certificates/history",
      migrate: "/api/certificates/migrate",
      logs: "/api/logs",
      teachers: "/api/teachers",
      modules: "/api/modules",
      printedCertificates: "/api/printed-certificates", // ADDED
    },
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// =====================================================
// ERROR HANDLING
// =====================================================

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
  console.error("❌ Server Error:", err);

  // CORS error
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({
      success: false,
      message: "CORS policy violation",
    });
  }

  // Default error
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
  console.log("=".repeat(50));
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🔗 API: http://localhost:${PORT}`);
  console.log(`📊 Summary: http://localhost:${PORT}/api/certificates/summary`);
  console.log(`👥 Teachers: http://localhost:${PORT}/api/teachers`);
  console.log(`📚 Modules: http://localhost:${PORT}/api/modules`);
  console.log(
    `📜 Printed Certificates: http://localhost:${PORT}/api/printed-certificates`,
  );
  console.log("=".repeat(50));
});

// =====================================================
// GRACEFUL SHUTDOWN
// =====================================================

process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server");
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT signal received: closing HTTP server");
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});

module.exports = app;
