// utils/responseHelper.js
const logger = require("./logger");

/**
 * Send standardized error response
 */
function sendError(res, statusCode, message, errorCode = null, error = null) {
  const response = {
    success: false,
    message: message,
    errorCode: errorCode,
  };

  if (error && process.env.NODE_ENV === "development") {
    response.error = error.message;
    response.stack = error.stack;
  }

  logger.error(`Error (${statusCode}): ${message}`, error || "");
  return res.status(statusCode).json(response);
}

/**
 * Send standardized success response
 */
function sendSuccess(res, message, data = null, meta = null) {
  const response = {
    success: true,
    message: message,
  };

  if (data !== null) response.data = data;
  if (meta !== null) response.meta = meta;

  // PENTING: Selalu set status 200 dan disable caching
  return res.status(200).set("Cache-Control", "no-store, no-cache, must-revalidate, private").set("Pragma", "no-cache").set("Expires", "0").json(response);
}

module.exports = { sendError, sendSuccess };
