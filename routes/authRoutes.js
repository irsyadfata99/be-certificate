const express = require("express");
const router = express.Router();
const { login } = require("../auth/AuthController");
const { verifyToken } = require("../auth/AuthMiddleware");

router.post("/login", login);

// Protected route example - INI YANG DIPANGGIL DI FRONTEND
router.get("/profile", verifyToken, (req, res) => {
  res.json({
    success: true,
    message: "Protected route accessed",
    user: req.user,
  });
});

module.exports = router;
