const express = require("express");
require("dotenv").config();
const authRoutes = require("./routes/authRoutes");
const certificateRoutes = require("./routes/certificateRoutes");
const certificateLogsRoutes = require("./routes/certificateLogsRoutes");
const userRoutes = require("./routes/userRoutes");

const app = express();

// =====================================================
// IMPROVED CORS CONFIGURATION
// =====================================================

// List of allowed origins (configure based on your environment)
const allowedOrigins = [
  "http://localhost:3000", // React default
  "http://localhost:3001",
  "http://localhost:5173", // Vite default
  "http://localhost:5174",
  "http://127.0.0.1:5500",
  "http://localhost:8080", // Vue default
  // Add your production domain here:
  // "https://yourdomain.com",
  // "https://www.yourdomain.com",
];

// CORS Middleware with proper configuration
app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Check if the origin is in the allowed list
  if (allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  } else if (process.env.NODE_ENV === "development") {
    // In development, allow all origins (can be removed in production)
    res.header("Access-Control-Allow-Origin", "*");
    console.warn(`⚠️  Warning: Allowing origin ${origin} in development mode`);
  }

  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization",
  );
  res.header("Access-Control-Allow-Credentials", "true");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware (optional but helpful)
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

// =====================================================
// ROOT & HEALTH CHECK
// =====================================================

// Test route
app.get("/", (req, res) => {
  res.json({
    message: "Certificate Management API is running",
    version: "2.0.0",
    endpoints: {
      auth: "/api/auth",
      certificates: "/api/certificates",
      summary: "/api/certificates/summary",
      history: "/api/certificates/history",
      migrate: "/api/certificates/migrate",
      logs: "/api/logs",
    },
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// =====================================================
// ERROR HANDLING
// =====================================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint not found",
    path: req.path,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// =====================================================
// START SERVER
// =====================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("=".repeat(50));
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🔗 API: http://localhost:${PORT}`);
  console.log(`📊 Summary: http://localhost:${PORT}/api/certificates/summary`);
  console.log("=".repeat(50));
});
