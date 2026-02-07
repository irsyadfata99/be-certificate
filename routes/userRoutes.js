// routes/userRoutes.js
// Handles current user profile and settings

const express = require("express");
const router = express.Router();
const {
  getProfile,
  updateUsername,
  updatePassword,
} = require("../controllers/UserController");
const { verifyToken } = require("../auth/AuthMiddleware");

// =====================================================
// ALL ROUTES REQUIRE AUTHENTICATION
// =====================================================
router.use(verifyToken);

// =====================================================
// PROFILE MANAGEMENT
// =====================================================

// Get current logged-in user profile
router.get("/profile", getProfile);

// =====================================================
// ACCOUNT SETTINGS
// =====================================================

// Update username (requires current password verification)
router.put("/username", updateUsername);

// Update password (requires current password verification)
router.put("/password", updatePassword);

module.exports = router;
