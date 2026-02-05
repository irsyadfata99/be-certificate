// controllers/UserController.js
const pool = require("../config/database");
const bcrypt = require("bcrypt");
const { logAction } = require("./CertificateLogsController");

// =====================================================
// GET CURRENT USER PROFILE
// =====================================================
const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      "SELECT id, username, created_at, updated_at FROM users WHERE id = $1",
      [userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// =====================================================
// UPDATE USERNAME
// =====================================================
const updateUsername = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const userId = req.user.id;
    const { new_username, current_password } = req.body;

    console.log("📝 Update username request for user ID:", userId);

    // Validation
    if (!new_username || !new_username.trim()) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "New username is required",
      });
    }

    if (!current_password) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Current password is required for verification",
      });
    }

    const cleanUsername = new_username.trim();

    // Username validation
    if (cleanUsername.length < 3) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Username must be at least 3 characters",
      });
    }

    if (cleanUsername.length > 50) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Username must not exceed 50 characters",
      });
    }

    // Only alphanumeric and underscore
    const validFormat = /^[A-Za-z0-9_]+$/;
    if (!validFormat.test(cleanUsername)) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Username can only contain letters, numbers, and underscores",
      });
    }

    // Get current user
    const userResult = await client.query("SELECT * FROM users WHERE id = $1", [
      userId,
    ]);

    if (userResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = userResult.rows[0];

    // Verify current password
    const validPassword = await bcrypt.compare(current_password, user.password);

    if (!validPassword) {
      await client.query("ROLLBACK");
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // Check if new username is same as current
    if (cleanUsername === user.username) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "New username is the same as current username",
      });
    }

    // Check if username already exists
    const checkExisting = await client.query(
      "SELECT id FROM users WHERE username = $1 AND id != $2",
      [cleanUsername, userId],
    );

    if (checkExisting.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "Username already taken",
      });
    }

    // Update username
    const result = await client.query(
      "UPDATE users SET username = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, username, created_at, updated_at",
      [cleanUsername, userId],
    );

    await client.query("COMMIT");

    console.log(`✅ Username updated: ${user.username} → ${cleanUsername}`);

    res.json({
      success: true,
      message: "Username updated successfully",
      data: result.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Update username error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

// =====================================================
// UPDATE PASSWORD - IMPROVED WITH DETAILED LOGGING
// =====================================================
const updatePassword = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const userId = req.user.id;
    const { current_password, new_password, confirm_password } = req.body;

    console.log("🔐 Password update request received");
    console.log("👤 User ID:", userId);
    console.log("📋 Request body keys:", Object.keys(req.body));

    // Validation
    if (!current_password || !new_password || !confirm_password) {
      console.error("❌ Validation failed: Missing fields");
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "All password fields are required",
      });
    }

    // Check if new password matches confirmation
    if (new_password !== confirm_password) {
      console.error("❌ Validation failed: Passwords don't match");
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "New password and confirmation do not match",
      });
    }

    // Password strength validation
    if (new_password.length < 8) {
      console.error("❌ Validation failed: Password too short");
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters",
      });
    }

    // Get current user
    console.log("🔍 Fetching user from database...");
    const userResult = await client.query("SELECT * FROM users WHERE id = $1", [
      userId,
    ]);

    if (userResult.rows.length === 0) {
      console.error("❌ User not found in database");
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = userResult.rows[0];
    console.log("✅ User found:", user.username);

    // Verify current password
    console.log("🔐 Verifying current password...");
    const validPassword = await bcrypt.compare(current_password, user.password);

    if (!validPassword) {
      console.error("❌ Current password is incorrect");
      await client.query("ROLLBACK");
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    console.log("✅ Current password verified");

    // Check if new password is same as current
    const sameAsOld = await bcrypt.compare(new_password, user.password);
    if (sameAsOld) {
      console.error("❌ New password is same as current password");
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "New password must be different from current password",
      });
    }

    // Hash new password
    console.log("🔒 Hashing new password...");
    const hashedPassword = await bcrypt.hash(new_password, 10);
    console.log("✅ Password hashed successfully");

    // Update password
    console.log("💾 Updating password in database...");
    await client.query(
      "UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [hashedPassword, userId],
    );

    await client.query("COMMIT");

    console.log(`✅ Password updated successfully for user: ${user.username}`);

    res.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("💥 Update password error:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

module.exports = {
  getProfile,
  updateUsername,
  updatePassword,
};
