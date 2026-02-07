// routes/exportRoutes.js
const express = require("express");
const router = express.Router();
const {
  exportCertificates,
  exportCertificateLogs,
  exportTeachers,
  exportModules,
  exportPrintedCertificates,
  exportAllData,
} = require("../controllers/ExportController");
const { verifyToken, requireAdmin } = require("../auth/AuthMiddleware");

// =====================================================
// ALL ROUTES REQUIRE AUTHENTICATION
// =====================================================
router.use(verifyToken);

// =====================================================
// EXPORT ENDPOINTS
// =====================================================

// Export all data (multi-sheet Excel) - Admin only
router.get("/all", requireAdmin, exportAllData);

// Export certificates - Admin only
router.get("/certificates", requireAdmin, exportCertificates);

// Export certificate logs - Admin only
router.get("/logs", requireAdmin, exportCertificateLogs);

// Export teachers - Admin only
router.get("/teachers", requireAdmin, exportTeachers);

// Export modules - Admin only
router.get("/modules", requireAdmin, exportModules);

// Export printed certificates - Teachers can export their own, Admins can export all in their branch
router.get("/printed-certificates", exportPrintedCertificates);

module.exports = router;
