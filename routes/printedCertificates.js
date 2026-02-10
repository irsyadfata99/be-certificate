// routes/printedCertificates.js
// Certificate printing routes with authentication

const express = require("express");
const router = express.Router();
const PrintedCertificateController = require("../controllers/PrintedCertificateController");
const { verifyToken } = require("../auth/AuthMiddleware");

// =====================================================
// ALL ROUTES REQUIRE AUTHENTICATION
// =====================================================

// Get modules for dropdown (teachers)
router.get("/modules", verifyToken, PrintedCertificateController.getModules);

// Search students for autocomplete
router.get(
  "/search-students",
  verifyToken,
  PrintedCertificateController.searchStudents,
);

// Save printed certificate record + deduct stock
router.post("/", verifyToken, PrintedCertificateController.savePrintRecord);

// Get print history with pagination and filters
router.get(
  "/history",
  verifyToken,
  PrintedCertificateController.getPrintHistory,
);

// Get single print record by ID
router.get(
  "/:id",
  verifyToken,
  PrintedCertificateController.getPrintRecordById,
);

module.exports = router;
