// utils/envValidator.js
// Environment variables validator

const logger = require("./logger");

/**
 * Validate required environment variables
 * @throws {Error} if any required variable is missing
 */
function validateEnvironment() {
  const requiredEnvVars = [
    "JWT_SECRET",
    "JWT_REFRESH_SECRET",
    "DB_USER",
    "DB_HOST",
    "DB_DATABASE",
    "DB_PASSWORD",
    "DB_PORT",
  ];

  const missingEnvVars = requiredEnvVars.filter(
    (envVar) => !process.env[envVar],
  );

  if (missingEnvVars.length > 0) {
    const errorMsg = `Missing required environment variables: ${missingEnvVars.join(", ")}`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Validate JWT secrets are different
  if (process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET) {
    const errorMsg =
      "JWT_SECRET and JWT_REFRESH_SECRET must be different for security";
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Validate JWT secrets length
  if (process.env.JWT_SECRET.length < 32) {
    logger.warn(
      "⚠️  WARNING: JWT_SECRET should be at least 32 characters for security",
    );
  }

  if (process.env.JWT_REFRESH_SECRET.length < 32) {
    logger.warn(
      "⚠️  WARNING: JWT_REFRESH_SECRET should be at least 32 characters for security",
    );
  }

  // Validate DB_PORT is a number
  const dbPort = parseInt(process.env.DB_PORT);
  if (isNaN(dbPort) || dbPort < 1 || dbPort > 65535) {
    const errorMsg = "DB_PORT must be a valid port number (1-65535)";
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Validate PORT if provided
  if (process.env.PORT) {
    const port = parseInt(process.env.PORT);
    if (isNaN(port) || port < 1 || port > 65535) {
      const errorMsg = "PORT must be a valid port number (1-65535)";
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  logger.info("✅ Environment variables validated successfully");
}

/**
 * Get environment info for logging
 */
function getEnvironmentInfo() {
  return {
    nodeEnv: process.env.NODE_ENV || "development",
    port: process.env.PORT || 3000,
    dbHost: process.env.DB_HOST,
    dbPort: process.env.DB_PORT,
    dbDatabase: process.env.DB_DATABASE,
    // Never log secrets!
  };
}

module.exports = {
  validateEnvironment,
  getEnvironmentInfo,
};
