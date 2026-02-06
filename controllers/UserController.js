// controllers/UserController.js - FIXED
const pool = require("../config/database");
const bcrypt = require("bcrypt");
const { logAction } = require("./CertificateLogsController");
const logger = require("../utils/logger");
const CONSTANTS = require("../utils/constants");
const validators = require("../utils/validators");

// =====================================================
// GET CURRENT USER PROFILE
// =====================================================
const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      "SELECT id, username, role, teacher_name, teacher_division, teacher_branch, created_at, updated_at FROM users WHERE id = $1",
      [userId],
    );

    if (result.rows.length === 0) {
      return res.status(CONSTANTS.HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: "User not found",
        errorCode: CONSTANTS.ERROR_CODES.NOT_FOUND,
      });
    }

    const user = result.rows[0];

    // Map to camelCase for response
    const userData = {
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };

    if (user.role === "teacher") {
      userData.teacherName = user.teacher_name;
      userData.teacherDivision = user.teacher_division;
      userData.teacherBranch = user.teacher_branch;
    }

    res.json({
      success: true,
      data: userData,
    });
  } catch (error) {
    logger.error("Get profile error:", error);
    res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: "Server error",
      errorCode: CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
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
    await client.query(
      `SET LOCAL statement_timeout = '${CONSTANTS.TRANSACTION.TIMEOUT}'`,
    );

    const userId = req.user.id;
    const { new_username: newUsername, current_password: currentPassword } =
      req.body;

    logger.debug("Update username request for user ID:", userId);

    // Validation
    if (!newUsername || !newUsername.trim()) {
      await client.query("ROLLBACK");
      return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "New username is required",
        errorCode: CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      });
    }

    if (!currentPassword) {
      await client.query("ROLLBACK");
      return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Current password is required for verification",
        errorCode: CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      });
    }

    // Validate username
    const usernameValidation = validators.validateUsername(newUsername);
    if (!usernameValidation.valid) {
      await client.query("ROLLBACK");
      return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: usernameValidation.error,
        errorCode: CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      });
    }

    const cleanUsername = usernameValidation.value;

    // Get current user
    const userResult = await client.query("SELECT * FROM users WHERE id = $1", [
      userId,
    ]);

    if (userResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(CONSTANTS.HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: "User not found",
        errorCode: CONSTANTS.ERROR_CODES.NOT_FOUND,
      });
    }

    const user = userResult.rows[0];

    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, user.password);

    if (!validPassword) {
      await client.query("ROLLBACK");
      return res.status(CONSTANTS.HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: "Current password is incorrect",
        errorCode: CONSTANTS.ERROR_CODES.INVALID_CREDENTIALS,
      });
    }

    // Check if new username is same as current
    if (cleanUsername === user.username) {
      await client.query("ROLLBACK");
      return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "New username is the same as current username",
        errorCode: CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      });
    }

    // Check if username already exists
    const checkExisting = await client.query(
      "SELECT id FROM users WHERE username = $1 AND id != $2",
      [cleanUsername, userId],
    );

    if (checkExisting.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(CONSTANTS.HTTP_STATUS.CONFLICT).json({
        success: false,
        message: "Username already taken",
        errorCode: CONSTANTS.ERROR_CODES.DUPLICATE_ENTRY,
      });
    }

    // Update username
    const result = await client.query(
      "UPDATE users SET username = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, username, created_at, updated_at",
      [cleanUsername, userId],
    );

    await client.query("COMMIT");

    logger.info(`Username updated: ${user.username} → ${cleanUsername}`);

    res.json({
      success: true,
      message: "Username updated successfully",
      data: result.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Update username error:", error);
    res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: "Server error",
      errorCode: CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  } finally {
    client.release();
  }
};

// =====================================================
// UPDATE PASSWORD - IMPROVED WITH LESS LOGGING
// =====================================================
const updatePassword = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `SET LOCAL statement_timeout = '${CONSTANTS.TRANSACTION.TIMEOUT}'`,
    );

    const userId = req.user.id;
    const {
      current_password: currentPassword,
      new_password: newPassword,
      confirm_password: confirmPassword,
    } = req.body;

    logger.debug("Password update request received for user ID:", userId);

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      await client.query("ROLLBACK");
      return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "All password fields are required",
        errorCode: CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      });
    }

    // Check if new password matches confirmation
    if (newPassword !== confirmPassword) {
      await client.query("ROLLBACK");
      return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "New password and confirmation do not match",
        errorCode: CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      });
    }

    // Password strength validation
    const passwordValidation = validators.validatePassword(newPassword);
    if (!passwordValidation.valid) {
      await client.query("ROLLBACK");
      return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: passwordValidation.error,
        errorCode: CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      });
    }

    // Get current user
    const userResult = await client.query("SELECT * FROM users WHERE id = $1", [
      userId,
    ]);

    if (userResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(CONSTANTS.HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: "User not found",
        errorCode: CONSTANTS.ERROR_CODES.NOT_FOUND,
      });
    }

    const user = userResult.rows[0];

    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, user.password);

    if (!validPassword) {
      await client.query("ROLLBACK");
      logger.warn(`Failed password change attempt for user: ${user.username}`);
      return res.status(CONSTANTS.HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: "Current password is incorrect",
        errorCode: CONSTANTS.ERROR_CODES.INVALID_CREDENTIALS,
      });
    }

    // Check if new password is same as current
    const sameAsOld = await bcrypt.compare(newPassword, user.password);
    if (sameAsOld) {
      await client.query("ROLLBACK");
      return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "New password must be different from current password",
        errorCode: CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(
      newPassword,
      CONSTANTS.PASSWORD.BCRYPT_ROUNDS,
    );

    // Update password
    await client.query(
      "UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [hashedPassword, userId],
    );

    await client.query("COMMIT");

    logger.info(`Password updated successfully for user: ${user.username}`);

    res.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Update password error:", error);
    res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: "Server error",
      errorCode: CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
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
