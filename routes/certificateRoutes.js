const express = require("express");
const router = express.Router();
const {
  createCertificate,
  getAllCertificates,
  getCertificateById,
  updateCertificate,
  deleteCertificate,
  clearAllCertificates, // NEW
  migrateCertificate,
  getStockSummary,
  getTransactionHistory,
} = require("../controllers/CertificateController");
const { verifyToken } = require("../auth/AuthMiddleware");

// =====================================================
// NEW ENDPOINTS - Stock Summary & Transaction History
// =====================================================

// Get current stock summary (total across all batches)
router.get("/summary", verifyToken, getStockSummary);

// Get transaction history with filters
router.get("/history", verifyToken, getTransactionHistory);

// =====================================================
// ORIGINAL ENDPOINTS
// =====================================================

// Create new batch (input stock)
router.post("/", verifyToken, createCertificate);

// Get all certificates
router.get("/", verifyToken, getAllCertificates);

// Get specific certificate by ID
router.get("/:id", verifyToken, getCertificateById);

// Update certificate (DISABLED - will return 403 error)
router.put("/:id", verifyToken, updateCertificate);

// Delete certificate (DISABLED - will return 403 error)
router.delete("/:id", verifyToken, deleteCertificate);

// NEW: Clear all certificates (bulk delete)
router.post("/clear-all", verifyToken, clearAllCertificates);

// Migrate stock from SND to other branches
router.post("/migrate", verifyToken, migrateCertificate);

module.exports = router;
