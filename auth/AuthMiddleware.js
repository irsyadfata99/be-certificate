// auth/AuthMiddleware.js
const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");
const CONSTANTS = require("../utils/constants");

// =====================================================
// VERIFY JWT TOKEN
// =====================================================
const verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.split(" ")[1]; // Bearer TOKEN

  if (!token) {
    logger.warn("Access attempt without token");
    return res.status(CONSTANTS.HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: "No token provided",
      errorCode: CONSTANTS.ERROR_CODES.UNAUTHORIZED,
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    logger.debug(`Token verified for user: ${decoded.username}`);
    next();
  } catch (error) {
    logger.warn("Invalid token attempt:", error.message);
    return res.status(CONSTANTS.HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: "Invalid or expired token",
      errorCode: CONSTANTS.ERROR_CODES.UNAUTHORIZED,
    });
  }
};

// =====================================================
// REQUIRE ADMIN ROLE
// =====================================================
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    logger.warn("Admin access attempt without authentication");
    return res.status(CONSTANTS.HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: "Authentication required",
      errorCode: CONSTANTS.ERROR_CODES.UNAUTHORIZED,
    });
  }

  if (req.user.role !== "admin") {
    logger.warn(`Non-admin access attempt by user: ${req.user.username}`);
    return res.status(CONSTANTS.HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: "Access denied. Admin privileges required.",
      errorCode: CONSTANTS.ERROR_CODES.FORBIDDEN,
    });
  }

  logger.debug(`Admin access granted: ${req.user.username}`);
  next();
};

// =====================================================
// REQUIRE TEACHER ROLE
// =====================================================
const requireTeacher = (req, res, next) => {
  if (!req.user) {
    logger.warn("Teacher access attempt without authentication");
    return res.status(CONSTANTS.HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: "Authentication required",
      errorCode: CONSTANTS.ERROR_CODES.UNAUTHORIZED,
    });
  }

  if (req.user.role !== "teacher") {
    logger.warn(`Non-teacher access attempt by user: ${req.user.username}`);
    return res.status(CONSTANTS.HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: "Access denied. Teacher privileges required.",
      errorCode: CONSTANTS.ERROR_CODES.FORBIDDEN,
    });
  }

  logger.debug(`Teacher access granted: ${req.user.username}`);
  next();
};

module.exports = { verifyToken, requireAdmin, requireTeacher };
