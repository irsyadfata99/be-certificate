const pool = require("../config/database");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");
const CONSTANTS = require("../utils/constants");
const validators = require("../utils/validators");
const { sendError, sendSuccess } = require("../utils/responseHelper");

// =====================================================
// HELPER: Generate Tokens
// =====================================================
const generateTokens = (user) => {
  const tokenPayload = {
    id: user.id,
    username: user.username,
    role: user.role,
  };

  // Include teacher-specific data for teacher role
  if (user.role === "teacher") {
    tokenPayload.teacher_name = user.teacher_name;
    tokenPayload.teacher_division = user.teacher_division;
    tokenPayload.teacher_branch = user.teacher_branch;
  }

  const accessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
    expiresIn: CONSTANTS.JWT.ACCESS_TOKEN_EXPIRES_IN,
    algorithm: CONSTANTS.JWT.ALGORITHM,
  });

  const refreshToken = jwt.sign(
    { id: user.id, username: user.username },
    process.env.JWT_REFRESH_SECRET,
    {
      expiresIn: CONSTANTS.JWT.REFRESH_TOKEN_EXPIRES_IN,
      algorithm: CONSTANTS.JWT.ALGORITHM,
    },
  );

  return { accessToken, refreshToken };
};

// =====================================================
// LOGIN
// =====================================================
const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validasi input
    if (!username || !password) {
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "Username and password are required",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    // Sanitize and validate username
    const usernameValidation = validators.validateUsername(username);
    if (!usernameValidation.valid) {
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        usernameValidation.error,
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    const cleanUsername = usernameValidation.value;

    // Cari user di database
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [
      cleanUsername,
    ]);

    if (result.rows.length === 0) {
      logger.warn(`Failed login attempt for username: ${cleanUsername}`);
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.UNAUTHORIZED,
        "Invalid credentials",
        CONSTANTS.ERROR_CODES.INVALID_CREDENTIALS,
      );
    }

    const user = result.rows[0];

    // Verifikasi password
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      logger.warn(`Failed password attempt for user: ${cleanUsername}`);
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.UNAUTHORIZED,
        "Invalid credentials",
        CONSTANTS.ERROR_CODES.INVALID_CREDENTIALS,
      );
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user);

    // Prepare user data for response
    const userData = {
      id: user.id,
      username: user.username,
      role: user.role,
    };

    // Include teacher-specific data if user is teacher
    if (user.role === "teacher") {
      userData.teacherName = user.teacher_name;
      userData.teacherDivision = user.teacher_division;
      userData.teacherBranch = user.teacher_branch;
    }

    logger.info(`Successful login: ${cleanUsername} (${user.role})`);

    return sendSuccess(res, "Login successful", {
      accessToken,
      refreshToken,
      user: userData,
    });
  } catch (error) {
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Server error",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
  }
};

// =====================================================
// REFRESH TOKEN
// =====================================================
const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "Refresh token is required",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (error) {
      logger.warn("Invalid refresh token attempt:", error.message);
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.UNAUTHORIZED,
        "Invalid or expired refresh token",
        CONSTANTS.ERROR_CODES.UNAUTHORIZED,
      );
    }

    // Get fresh user data from database
    const result = await pool.query(
      "SELECT * FROM users WHERE id = $1 AND username = $2",
      [decoded.id, decoded.username],
    );

    if (result.rows.length === 0) {
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.UNAUTHORIZED,
        "User not found",
        CONSTANTS.ERROR_CODES.UNAUTHORIZED,
      );
    }

    const user = result.rows[0];

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

    logger.info(`Token refreshed for user: ${user.username}`);

    return sendSuccess(res, "Token refreshed successfully", {
      accessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Server error",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
  }
};

module.exports = { login, refreshToken };
