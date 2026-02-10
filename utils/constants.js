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

  // Valid divisions with age ranges
  DIVISIONS: ["JK", "LK"],

  DIVISION_AGE_RANGES: {
    JK: {
      name: "Junior Koder",
      ranges: [
        { min: 8, max: 12, label: "JK Level 1 (8-12)" },
        { min: 12, max: 16, label: "JK Level 2 (12-16)" },
      ],
      overall_min: 8,
      overall_max: 16,
    },
    LK: {
      name: "Little Koder",
      ranges: [
        { min: 4, max: 6, label: "LK Level 1 (4-6)" },
        { min: 6, max: 8, label: "LK Level 2 (6-8)" },
      ],
      overall_min: 4,
      overall_max: 8,
    },
  },

  // Valid branches
  DEFAULT_BRANCHES: {
    SND: { code: "SND", name: "Sunda", is_central: true },
    MKW: { code: "MKW", name: "Mekarwangi", is_central: false },
    KBP: { code: "KBP", name: "Kota Baru Parahyangan", is_central: false },
  },

  CENTRAL_BRANCH: "SND",

  // Valid roles
  ROLES: ["admin", "teacher"],

  // NEW: Teacher status (for soft delete)
  TEACHER_STATUS: {
    ACTIVE: "active",
    RESIGNED: "resigned",
  },

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
    TEACHER_RESIGNED: "TEACHER_RESIGNED", // NEW: For soft delete
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
    ACCOUNT_INACTIVE: "ACCOUNT_INACTIVE", // NEW: For resigned teacher login
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

  PRINTED_CERTS: "/printed-certificates",
  PRINTED_CERT_MODULES: "/printed-certificates/modules",
  PRINTED_CERT_HISTORY: "/printed-certificates/history",
  PRINTED_CERT_SEARCH_STUDENTS: "/printed-certificates/search-students",
};
