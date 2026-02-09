// routes/branchRoutes.js
// Branch Management Routes - Phase 3 (CREATE ENABLED)
// Handles routing for all branch-related endpoints

const express = require("express");
const router = express.Router();
const { getAllBranches, getBranchById, createBranch, updateBranch, toggleBranchStatus, deleteBranch, getBranchStats } = require("../controllers/BranchController");
const { verifyToken, requireAdmin } = require("../auth/AuthMiddleware");

// =====================================================
// ALL ROUTES REQUIRE AUTHENTICATION
// =====================================================
router.use(verifyToken);

// =====================================================
// BRANCH STATISTICS
// =====================================================

// Get branch statistics
// Accessible by both admin and teachers
router.get("/stats", getBranchStats);

// =====================================================
// BRANCH CRUD OPERATIONS
// =====================================================

// Get all branches
// Accessible by both admin and teachers (needed for dropdowns)
router.get("/", getAllBranches);

// Get specific branch by ID
// Accessible by both admin and teachers
router.get("/:id", getBranchById);

// Create new branch - Admin only (NOW ENABLED)
router.post("/", requireAdmin, createBranch);

// Update branch name - Admin only
router.put("/:id", requireAdmin, updateBranch);

// Delete branch - Admin only (with safety checks)
router.delete("/:id", requireAdmin, deleteBranch);

// =====================================================
// BRANCH STATUS MANAGEMENT
// =====================================================

// Toggle branch status (activate/deactivate) - Admin only
router.patch("/:id/toggle-status", requireAdmin, toggleBranchStatus);

module.exports = router;
