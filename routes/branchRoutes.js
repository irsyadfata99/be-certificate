// routes/branchRoutes.js
// Branch Management Routes - WITH REGIONAL HUB SUPPORT
// Version 2.0 - Added head branches and regional hub filtering

const express = require("express");
const router = express.Router();
const {
  getAllBranches,
  getBranchById,
  createBranch,
  updateBranch,
  toggleBranchStatus,
  deleteBranch,
  getBranchStats,
  getHeadBranches,
  getBranchesByHub,
} = require("../controllers/BranchController");
const { verifyToken, requireAdmin } = require("../auth/AuthMiddleware");

// =====================================================
// ALL ROUTES REQUIRE AUTHENTICATION
// =====================================================
router.use(verifyToken);

// =====================================================
// BRANCH STATISTICS
// =====================================================

// Get branch statistics (now includes regional hub breakdown)
// Accessible by both admin and teachers
router.get("/stats", getBranchStats);

// =====================================================
// HEAD BRANCHES (NEW)
// =====================================================

// Get all head branches (for dropdown in forms)
// Accessible by both admin and teachers
router.get("/head-branches", getHeadBranches);

// Get branches by regional hub
// Accessible by both admin and teachers
router.get("/hub/:hub", getBranchesByHub);

// =====================================================
// BRANCH CRUD OPERATIONS
// =====================================================

// Get all branches (now includes is_head_branch and regional_hub)
// Accessible by both admin and teachers
router.get("/", getAllBranches);

// Get specific branch by ID
// Accessible by both admin and teachers
router.get("/:id", getBranchById);

// Create new branch - Admin only
// Now supports is_head_branch and regional_hub
router.post("/", requireAdmin, createBranch);

// Update branch name - Admin only
// Note: branch_code, is_head_branch, regional_hub CANNOT be changed
router.put("/:id", requireAdmin, updateBranch);

// Delete branch - Admin only (with safety checks)
// Additional check: cannot delete head branch if it has dependent branches
router.delete("/:id", requireAdmin, deleteBranch);

// =====================================================
// BRANCH STATUS MANAGEMENT
// =====================================================

// Toggle branch status (activate/deactivate) - Admin only
// Additional check: cannot deactivate head branch if it has active dependent branches
router.patch("/:id/toggle-status", requireAdmin, toggleBranchStatus);

module.exports = router;
