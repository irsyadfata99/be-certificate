const pool = require("../config/database");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");
const CONSTANTS = require("../utils/constants");
const validators = require("../utils/validators");

// Login
const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validasi input
    if (!username || !password) {
      return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Username and password are required",
        errorCode: CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      });
    }

    // Sanitize and validate username
    const usernameValidation = validators.validateUsername(username);
    if (!usernameValidation.valid) {
      return res.status(CONSTANTS.HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: usernameValidation.error,
        errorCode: CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      });
    }

    const cleanUsername = usernameValidation.value;

    // Cari user di database
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [
      cleanUsername,
    ]);

    if (result.rows.length === 0) {
      logger.warn(`Failed login attempt for username: ${cleanUsername}`);
      return res.status(CONSTANTS.HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: "Invalid credentials",
        errorCode: CONSTANTS.ERROR_CODES.INVALID_CREDENTIALS,
      });
    }

    const user = result.rows[0];

    // Verifikasi password
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      logger.warn(`Failed password attempt for user: ${cleanUsername}`);
      return res.status(CONSTANTS.HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: "Invalid credentials",
        errorCode: CONSTANTS.ERROR_CODES.INVALID_CREDENTIALS,
      });
    }

    // Generate JWT token with role
    const tokenPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
    };

    // Include teacher-specific data in JWT for teacher role
    if (user.role === "teacher") {
      tokenPayload.teacher_name = user.teacher_name;
      tokenPayload.teacher_division = user.teacher_division;
      tokenPayload.teacher_branch = user.teacher_branch;
    }

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: CONSTANTS.JWT.EXPIRES_IN,
      algorithm: CONSTANTS.JWT.ALGORITHM,
    });

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

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: userData,
    });
  } catch (error) {
    logger.error("Login error:", error);
    res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: "Server error",
      errorCode: CONSTANTS.ERROR_CODES.SERVER_ERROR,
    });
  }
};

module.exports = { login };
