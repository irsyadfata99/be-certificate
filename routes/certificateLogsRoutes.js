// Certificate Logs Routes
// Create new file: routes/certificateLogsRoutes.js

const express = require("express");
const router = express.Router();
const {
  getLogs,
  getLogsByCertificate,
  deleteOldLogs,
} = require("../controllers/CertificateLogsController");
const { verifyToken } = require("../auth/AuthMiddleware");

// Get all logs with filters
router.get("/", verifyToken, getLogs);

// Get logs for specific certificate
router.get("/certificate/:id", verifyToken, getLogsByCertificate);

// Delete old logs (admin only - add admin check if needed)
router.delete("/cleanup", verifyToken, deleteOldLogs);

module.exports = router;
