// routes/userRoutes.js
const express = require("express");
const router = express.Router();
const {
  getProfile,
  updateUsername,
  updatePassword,
} = require("../controllers/UserController");
const { verifyToken } = require("../auth/AuthMiddleware");

// Get current user profile
router.get("/profile", verifyToken, getProfile);

// Update username
router.put("/username", verifyToken, updateUsername);

// Update password
router.put("/password", verifyToken, updatePassword);

module.exports = router;
