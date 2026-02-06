// Module Routes
// Handles all module-related endpoints (admin only)

const express = require("express");
const router = express.Router();
const {
  createModule,
  getAllModules,
  getModuleById,
  updateModule,
  deleteModule,
} = require("../controllers/ModuleController");
const { verifyToken, requireAdmin } = require("../auth/AuthMiddleware");

console.log("✅ Module routes loaded");

// All module routes require authentication AND admin role
router.use(verifyToken);
router.use(requireAdmin);

// Create new module
router.post("/", createModule);

// Get all modules (with pagination)
router.get("/", getAllModules);

// Get specific module by ID
router.get("/:id", getModuleById);

// Update module
router.put("/:id", updateModule);

// Delete module
router.delete("/:id", deleteModule);

module.exports = router;
