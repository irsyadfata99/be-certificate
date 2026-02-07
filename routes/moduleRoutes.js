// routes/moduleRoutes.js
// Handles all module-related endpoints (admin only)

const express = require("express");
const router = express.Router();
const {
  createModule,
  getAllModules,
  getModuleById,
  updateModule,
  deleteModule,
  getModuleStats,
} = require("../controllers/ModuleController");
const { verifyToken, requireAdmin } = require("../auth/AuthMiddleware");

// =====================================================
// ALL ROUTES REQUIRE AUTHENTICATION AND ADMIN ROLE
// =====================================================
router.use(verifyToken);
router.use(requireAdmin);

// =====================================================
// MODULE STATISTICS
// =====================================================

// Get module statistics (total, by division, age ranges)
router.get("/stats", getModuleStats);

// =====================================================
// MODULE CRUD OPERATIONS
// =====================================================

// Create new module
router.post("/", createModule);

// Get all modules (with pagination and filters)
router.get("/", getAllModules);

// Get specific module by ID
router.get("/:id", getModuleById);

// Update module
router.put("/:id", updateModule);

// Delete module
router.delete("/:id", deleteModule);

module.exports = router;
