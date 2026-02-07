// routes/certificateRoutes.js
const express = require("express");
const router = express.Router();
const {
  createCertificate,
  getAllCertificates,
  getCertificateById,
  updateCertificate,
  deleteCertificate,
  clearAllCertificates,
  migrateCertificate,
  getStockSummary,
  getTransactionHistory,
} = require("../controllers/CertificateController");
const { verifyToken } = require("../auth/AuthMiddleware");

// =====================================================
// ALL ROUTES REQUIRE AUTHENTICATION
// =====================================================
router.use(verifyToken);

// =====================================================
// SUMMARY & REPORTING ENDPOINTS
// =====================================================

// Get current stock summary (total across all batches)
router.get("/summary", getStockSummary);

// Get transaction history with filters
router.get("/history", getTransactionHistory);

// =====================================================
// BATCH OPERATIONS
// =====================================================

// Create new batch (input stock)
router.post("/", createCertificate);

// Clear all certificates (bulk delete)
router.post("/clear-all", clearAllCertificates);

// Migrate stock from SND to other branches
router.post("/migrate", migrateCertificate);

// =====================================================
// INDIVIDUAL CERTIFICATE OPERATIONS
// =====================================================

// Get all certificates (with pagination)
router.get("/", getAllCertificates);

// Get specific certificate by ID
router.get("/:id", getCertificateById);

// Update certificate (DISABLED - will return 403 error)
router.put("/:id", updateCertificate);

// Delete certificate (DISABLED - will return 403 error)
router.delete("/:id", deleteCertificate);

module.exports = router;
