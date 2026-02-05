// Certificate Logs Routes - FIXED VERSION

const express = require("express");
const router = express.Router();
const {
  getLogs,
  getLogsByCertificate,
  deleteOldLogs,
  recoverFailedLogs, // NEW
} = require("../controllers/CertificateLogsController");
const { verifyToken } = require("../auth/AuthMiddleware");

// Get all logs with filters
router.get("/", verifyToken, getLogs);

// Get logs for specific certificate
router.get("/certificate/:id", verifyToken, getLogsByCertificate);

// Delete old logs (admin only - add admin check if needed)
router.delete("/cleanup", verifyToken, deleteOldLogs);

// NEW: Recover failed logs from backup file
router.post("/recover", verifyToken, recoverFailedLogs);

module.exports = router;
