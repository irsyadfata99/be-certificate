// middleware/timeout.js
// Request timeout middleware to prevent long-running requests

const logger = require("../utils/logger");
const CONSTANTS = require("../utils/constants");

/**
 * Request timeout middleware
 * Automatically aborts requests that take longer than specified timeout
 */
const requestTimeout = (timeoutMs = 30000) => {
  return (req, res, next) => {
    // Set timeout for request
    req.setTimeout(timeoutMs, () => {
      logger.warn(`Request timeout: ${req.method} ${req.path}`, {
        timeout: timeoutMs,
        ip: req.ip,
        user: req.user?.username,
      });

      // Only send response if headers haven't been sent yet
      if (!res.headersSent) {
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
          success: false,
          message: "Request timeout - operation took too long to complete",
          errorCode: "REQUEST_TIMEOUT",
          timeout: `${timeoutMs}ms`,
        });
      }
    });

    // Set timeout for response
    res.setTimeout(timeoutMs, () => {
      logger.warn(`Response timeout: ${req.method} ${req.path}`, {
        timeout: timeoutMs,
        ip: req.ip,
        user: req.user?.username,
      });

      // Connection will be closed automatically
      if (!res.headersSent) {
        res.status(CONSTANTS.HTTP_STATUS.SERVER_ERROR).json({
          success: false,
          message: "Response timeout - server took too long to respond",
          errorCode: "RESPONSE_TIMEOUT",
          timeout: `${timeoutMs}ms`,
        });
      }
    });

    next();
  };
};

module.exports = requestTimeout;
