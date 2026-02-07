// routes/certificateLogsRoutes.js
const express = require("express");
const router = express.Router();
const {
  getLogs,
  getLogsByCertificate,
  deleteOldLogs,
  recoverFailedLogs,
} = require("../controllers/CertificateLogsController");
const { verifyToken } = require("../auth/AuthMiddleware");

// =====================================================
// ALL ROUTES REQUIRE AUTHENTICATION
// =====================================================
router.use(verifyToken);

// =====================================================
// LOG RETRIEVAL
// =====================================================

// Get all logs with filters (pagination, search, date range)
router.get("/", getLogs);

// Get logs for specific certificate batch
router.get("/certificate/:id", getLogsByCertificate);

// =====================================================
// LOG MANAGEMENT (ADMIN ONLY - consider adding requireAdmin middleware)
// =====================================================

// Delete old logs (cleanup - default 90 days)
router.delete("/cleanup", deleteOldLogs);

// Recover failed logs from backup file
router.post("/recover", recoverFailedLogs);

module.exports = router;
