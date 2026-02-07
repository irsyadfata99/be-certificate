// utils/constants.js
// Centralized constants to eliminate magic numbers throughout the codebase

module.exports = {
  // Pagination settings
  PAGINATION: {
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 100,
    DEFAULT_OFFSET: 0,
    CERTIFICATES_DEFAULT_LIMIT: 5,
    LOGS_DEFAULT_LIMIT: 100,
    HISTORY_DEFAULT_LIMIT: 50,
  },

  // Password settings
  PASSWORD: {
    MIN_LENGTH: 8,
    BCRYPT_ROUNDS: 10,
    DEFAULT_GENERATED_LENGTH: 12,
  },

  // Age range for modules
  AGE_RANGE: {
    MIN: 3,
    MAX: 18,
  },

  // Certificate ID validation
  CERTIFICATE_ID: {
    MIN_LENGTH: 3,
    MAX_LENGTH: 50,
    VALID_PATTERN: /^[A-Za-z0-9_-]+$/,
  },

  // Username validation
  USERNAME: {
    MIN_LENGTH: 3,
    MAX_LENGTH: 50,
    VALID_PATTERN: /^[A-Za-z0-9_]+$/,
  },

  JWT: {
    ACCESS_TOKEN_EXPIRES_IN: "1h",
    REFRESH_TOKEN_EXPIRES_IN: "7d",
    ALGORITHM: "HS256",
  },

  // Teacher name validation
  TEACHER_NAME: {
    MIN_LENGTH: 3,
    MAX_LENGTH: 100,
  },

  // Database transaction settings
  TRANSACTION: {
    TIMEOUT: 5000, // milliseconds
  },

  // Valid divisions
  DIVISIONS: ["JK", "LK"],

  // Valid branches
  BRANCHES: ["SND", "MKW", "KBP"],

  // Valid roles
  ROLES: ["admin", "teacher"],

  // Valid action types for logs
  LOG_ACTION_TYPES: {
    CREATE: "CREATE",
    UPDATE: "UPDATE",
    DELETE: "DELETE",
    DELETE_ALL: "DELETE_ALL",
    MIGRATE: "MIGRATE",
    MODULE_CREATED: "MODULE_CREATED",
    MODULE_UPDATED: "MODULE_UPDATED",
    MODULE_DELETED: "MODULE_DELETED",
  },

  // Error codes
  ERROR_CODES: {
    VALIDATION_ERROR: "VALIDATION_ERROR",
    NOT_FOUND: "NOT_FOUND",
    DUPLICATE_ENTRY: "DUPLICATE_ENTRY",
    UNAUTHORIZED: "UNAUTHORIZED",
    FORBIDDEN: "FORBIDDEN",
    INSUFFICIENT_STOCK: "INSUFFICIENT_STOCK",
    INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
    SERVER_ERROR: "SERVER_ERROR",
    DATABASE_ERROR: "DATABASE_ERROR",
  },

  // HTTP Status codes (for reference)
  HTTP_STATUS: {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    SERVER_ERROR: 500,
  },
};
