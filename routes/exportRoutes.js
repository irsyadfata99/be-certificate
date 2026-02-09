// routes/exportRoutes.js - UPDATED for Phase 4
// Added student export endpoints

const express = require("express");
const router = express.Router();
const { exportCertificates, exportCertificateLogs, exportTeachers, exportModules, exportPrintedCertificates, exportStudents, exportStudentsByBranch, exportStudentTransferHistory, exportAllData } = require("../controllers/ExportController");
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

// =====================================================
// NEW: STUDENT EXPORT ENDPOINTS
// =====================================================

// Export all students (optionally filtered by branch) - Admin only
router.get("/students", requireAdmin, exportStudents);

// Export students by specific branch - Admin only
router.get("/students/branch/:branch_code", requireAdmin, exportStudentsByBranch);

// Export student transfer history - Admin only
router.get("/student-transfers", requireAdmin, exportStudentTransferHistory);

module.exports = router;
