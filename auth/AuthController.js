// auth/AuthController.js - WITH REGIONAL HUB SUPPORT AND SOFT DELETE
// Version 3.0 - Added is_active check for teacher login

const pool = require("../config/database");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");
const CONSTANTS = require("../utils/constants");
const validators = require("../utils/validators");
const { sendError, sendSuccess } = require("../utils/responseHelper");

// =====================================================
// HELPER: Generate Tokens - WITH REGIONAL HUB INFO
// =====================================================
const generateTokens = async (user) => {
  const tokenPayload = {
    id: user.id,
    username: user.username,
    role: user.role,
  };

  // Include teacher-specific data with arrays for teacher role
  if (user.role === "teacher") {
    tokenPayload.teacher_name = user.teacher_name;
    tokenPayload.teacher_division = user.teacher_division; // Legacy field
    tokenPayload.teacher_branch = user.teacher_branch; // Legacy field

    // Fetch branches & divisions arrays from database
    try {
      const client = await pool.connect();
      try {
        // Get divisions array
        const divisionsResult = await client.query(
          "SELECT DISTINCT division FROM teacher_divisions WHERE teacher_id = $1 ORDER BY division",
          [user.id],
        );
        tokenPayload.divisions = divisionsResult.rows.map(
          (row) => row.division,
        );

        // Get branches array with details
        const branchesResult = await client.query(
          `SELECT b.id as branch_id, b.branch_code, b.branch_name
           FROM teacher_branches tb
           JOIN branches b ON tb.branch_id = b.id
           WHERE tb.teacher_id = $1
           ORDER BY b.branch_name`,
          [user.id],
        );
        tokenPayload.branches = branchesResult.rows;

        // ===== GET REGIONAL HUB INFO =====
        // Get the teacher's primary branch details
        const teacherBranchInfo = await client.query(
          `SELECT 
            b.branch_code,
            b.branch_name,
            b.is_head_branch,
            b.regional_hub,
            hub.branch_name as hub_name
           FROM branches b
           LEFT JOIN branches hub ON b.regional_hub = hub.branch_code
           WHERE b.branch_code = $1`,
          [user.teacher_branch],
        );

        if (teacherBranchInfo.rows.length > 0) {
          const branchInfo = teacherBranchInfo.rows[0];

          // Add regional hub information to token
          tokenPayload.regional_hub = branchInfo.regional_hub;
          tokenPayload.is_head_branch = branchInfo.is_head_branch;
          tokenPayload.hub_name = branchInfo.hub_name;

          logger.debug(`Teacher ${user.username} regional info:`, {
            branch: branchInfo.branch_code,
            hub: branchInfo.regional_hub,
            isHead: branchInfo.is_head_branch,
          });
        } else {
          logger.warn(
            `Branch info not found for teacher ${user.username} (branch: ${user.teacher_branch})`,
          );
          // Fallback values
          tokenPayload.regional_hub = user.teacher_branch;
          tokenPayload.is_head_branch = false;
          tokenPayload.hub_name = null;
        }
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error("Error fetching teacher assignments for JWT:", error);
      // Fallback to legacy single values if error
      tokenPayload.divisions = [user.teacher_division];
      tokenPayload.branches = [
        {
          branch_code: user.teacher_branch,
          branch_name: user.teacher_branch,
        },
      ];
      // Fallback regional hub info
      tokenPayload.regional_hub = user.teacher_branch;
      tokenPayload.is_head_branch = false;
      tokenPayload.hub_name = null;
    }
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
// LOGIN - WITH REGIONAL HUB INFO AND SOFT DELETE CHECK
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

    // ===== NEW: CHECK IF ACCOUNT IS ACTIVE (SOFT DELETE) =====
    if (user.is_active === false) {
      logger.warn(
        `Login attempt by inactive user: ${cleanUsername} (resigned: ${user.resigned_at})`,
      );
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.FORBIDDEN,
        user.role === "teacher"
          ? "This account has been deactivated. Please contact the administrator."
          : "This account is inactive. Please contact support.",
        CONSTANTS.ERROR_CODES.ACCOUNT_INACTIVE,
      );
    }

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

    // Generate tokens (now includes regional hub info for teachers)
    const { accessToken, refreshToken } = await generateTokens(user);

    // Prepare user data for response
    const userData = {
      id: user.id,
      username: user.username,
      role: user.role,
      is_active: user.is_active,
    };

    // Include teacher-specific data with arrays if user is teacher
    if (user.role === "teacher") {
      userData.teacherName = user.teacher_name;
      userData.teacherDivision = user.teacher_division; // Legacy field
      userData.teacherBranch = user.teacher_branch; // Legacy field

      // Fetch branches & divisions arrays
      try {
        // Get divisions array
        const divisionsResult = await pool.query(
          "SELECT DISTINCT division FROM teacher_divisions WHERE teacher_id = $1 ORDER BY division",
          [user.id],
        );
        userData.divisions = divisionsResult.rows.map((row) => row.division);

        // Get branches array
        const branchesResult = await pool.query(
          `SELECT b.id as branch_id, b.branch_code, b.branch_name
           FROM teacher_branches tb
           JOIN branches b ON tb.branch_id = b.id
           WHERE tb.teacher_id = $1
           ORDER BY b.branch_name`,
          [user.id],
        );
        userData.branches = branchesResult.rows;

        // ===== GET REGIONAL HUB INFO FOR RESPONSE =====
        const branchInfo = await pool.query(
          `SELECT 
            b.branch_code,
            b.branch_name,
            b.is_head_branch,
            b.regional_hub,
            hub.branch_name as hub_name
           FROM branches b
           LEFT JOIN branches hub ON b.regional_hub = hub.branch_code
           WHERE b.branch_code = $1`,
          [user.teacher_branch],
        );

        if (branchInfo.rows.length > 0) {
          const info = branchInfo.rows[0];
          userData.regionalHub = info.regional_hub;
          userData.isHeadBranch = info.is_head_branch;
          userData.hubName = info.hub_name;
          userData.branchInfo = {
            code: info.branch_code,
            name: info.branch_name,
            isHead: info.is_head_branch,
            regionalHub: info.regional_hub,
            hubName: info.hub_name,
          };
        }
      } catch (error) {
        logger.error("Error fetching teacher assignments for response:", error);
        // Fallback to legacy values
        userData.divisions = [user.teacher_division];
        userData.branches = [
          {
            branch_code: user.teacher_branch,
            branch_name: user.teacher_branch,
          },
        ];
        userData.regionalHub = user.teacher_branch;
        userData.isHeadBranch = false;
      }
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
// REFRESH TOKEN - WITH REGIONAL HUB INFO AND SOFT DELETE CHECK
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

    // ===== NEW: CHECK IF ACCOUNT IS STILL ACTIVE =====
    if (user.is_active === false) {
      logger.warn(
        `Token refresh attempt by inactive user: ${user.username} (resigned: ${user.resigned_at})`,
      );
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.FORBIDDEN,
        "This account has been deactivated",
        CONSTANTS.ERROR_CODES.ACCOUNT_INACTIVE,
      );
    }

    // Generate new tokens (now includes regional hub info for teachers)
    const { accessToken, refreshToken: newRefreshToken } =
      await generateTokens(user);

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
