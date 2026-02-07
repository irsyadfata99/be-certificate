// routes/authRoutes.js
const express = require("express");
const router = express.Router();
const { login } = require("../auth/AuthController");
const { verifyToken } = require("../auth/AuthMiddleware");

// =====================================================
// PUBLIC ROUTES
// =====================================================

// Login endpoint
router.post("/login", login);

// =====================================================
// PROTECTED ROUTES
// =====================================================

// Get current user profile (used by frontend to verify token)
router.get("/profile", verifyToken, (req, res) => {
  res.json({
    success: true,
    message: "Protected route accessed",
    user: req.user,
  });
});

module.exports = router;
