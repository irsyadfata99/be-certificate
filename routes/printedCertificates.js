// routes/printedCertificateRoutes.js
const express = require("express");
const router = express.Router();
const {
  getModules,
  searchStudents,
  savePrintRecord,
  getPrintHistory,
  getPrintRecordById,
} = require("../controllers/PrintedCertificateController");
const { verifyToken } = require("../auth/AuthMiddleware");

// =====================================================
// ALL ROUTES REQUIRE AUTHENTICATION
// =====================================================
router.use(verifyToken);

// =====================================================
// SUPPORT ENDPOINTS FOR PRINTING
// =====================================================

// Get modules for dropdown (used in print form)
router.get("/modules", getModules);

// Search students for autocomplete (used in print form)
router.get("/search-students", searchStudents);

// =====================================================
// PRINT RECORD OPERATIONS
// =====================================================

// Get print history with filters (for history page - future feature)
router.get("/history", getPrintHistory);

// Save new print record (after printing)
router.post("/", savePrintRecord);

// Get single print record by ID (for details view - future feature)
router.get("/:id", getPrintRecordById);

module.exports = router;
