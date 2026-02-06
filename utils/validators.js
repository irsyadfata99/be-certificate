// utils/validators.js
// Centralized validation functions

const CONSTANTS = require("./constants");

/**
 * Sanitize string input to prevent XSS
 */
function sanitizeString(str) {
  if (!str) return str;
  return str.toString().trim().replace(/[<>]/g, "");
}

/**
 * Validate positive integer
 */
function validatePositiveInteger(value, fieldName, maxValue = 2147483647) {
  const num = parseInt(value);
  if (isNaN(num)) {
    return { valid: false, error: `${fieldName} must be a number` };
  }
  if (num < 0) {
    return { valid: false, error: `${fieldName} cannot be negative` };
  }
  if (!Number.isInteger(num)) {
    return { valid: false, error: `${fieldName} must be an integer` };
  }
  if (num > maxValue) {
    return {
      valid: false,
      error: `${fieldName} exceeds maximum value of ${maxValue}`,
    };
  }
  return { valid: true, value: num };
}

/**
 * Validate certificate ID
 */
function validateCertificateId(certificateId) {
  if (!certificateId || !certificateId.trim()) {
    return { valid: false, error: "Certificate ID is required" };
  }

  const cleanId = sanitizeString(certificateId.trim());

  if (cleanId.length < CONSTANTS.CERTIFICATE_ID.MIN_LENGTH) {
    return {
      valid: false,
      error: `Certificate ID must be at least ${CONSTANTS.CERTIFICATE_ID.MIN_LENGTH} characters`,
    };
  }

  if (cleanId.length > CONSTANTS.CERTIFICATE_ID.MAX_LENGTH) {
    return {
      valid: false,
      error: `Certificate ID must not exceed ${CONSTANTS.CERTIFICATE_ID.MAX_LENGTH} characters`,
    };
  }

  if (!CONSTANTS.CERTIFICATE_ID.VALID_PATTERN.test(cleanId)) {
    return {
      valid: false,
      error:
        "Certificate ID can only contain letters, numbers, dashes, and underscores",
    };
  }

  return { valid: true, value: cleanId };
}

/**
 * Validate teacher name
 */
function validateTeacherName(name) {
  if (!name || !name.trim()) {
    return { valid: false, error: "Teacher name is required" };
  }

  const cleanName = sanitizeString(name.trim());

  if (cleanName.length < CONSTANTS.TEACHER_NAME.MIN_LENGTH) {
    return {
      valid: false,
      error: `Teacher name must be at least ${CONSTANTS.TEACHER_NAME.MIN_LENGTH} characters`,
    };
  }

  if (cleanName.length > CONSTANTS.TEACHER_NAME.MAX_LENGTH) {
    return {
      valid: false,
      error: `Teacher name must not exceed ${CONSTANTS.TEACHER_NAME.MAX_LENGTH} characters`,
    };
  }

  return { valid: true, value: cleanName };
}

/**
 * Validate username
 */
function validateUsername(username) {
  if (!username || !username.trim()) {
    return { valid: false, error: "Username is required" };
  }

  const cleanUsername = sanitizeString(username.trim());

  if (cleanUsername.length < CONSTANTS.USERNAME.MIN_LENGTH) {
    return {
      valid: false,
      error: `Username must be at least ${CONSTANTS.USERNAME.MIN_LENGTH} characters`,
    };
  }

  if (cleanUsername.length > CONSTANTS.USERNAME.MAX_LENGTH) {
    return {
      valid: false,
      error: `Username must not exceed ${CONSTANTS.USERNAME.MAX_LENGTH} characters`,
    };
  }

  if (!CONSTANTS.USERNAME.VALID_PATTERN.test(cleanUsername)) {
    return {
      valid: false,
      error: "Username can only contain letters, numbers, and underscores",
    };
  }

  return { valid: true, value: cleanUsername };
}

/**
 * Validate division
 */
function validateDivision(division) {
  if (!division || !division.trim()) {
    return { valid: false, error: "Division is required" };
  }

  const cleanDivision = sanitizeString(division.trim().toUpperCase());

  if (!CONSTANTS.DIVISIONS.includes(cleanDivision)) {
    return {
      valid: false,
      error: `Division must be either ${CONSTANTS.DIVISIONS.join(" or ")}`,
    };
  }

  return { valid: true, value: cleanDivision };
}

/**
 * Validate branch
 */
function validateBranch(branch) {
  if (!branch || !branch.trim()) {
    return { valid: false, error: "Branch is required" };
  }

  const cleanBranch = sanitizeString(branch.trim().toUpperCase());

  if (!CONSTANTS.BRANCHES.includes(cleanBranch)) {
    return {
      valid: false,
      error: `Branch must be ${CONSTANTS.BRANCHES.join(", ")}`,
    };
  }

  return { valid: true, value: cleanBranch };
}

/**
 * Validate password
 */
function validatePassword(password) {
  if (!password) {
    return { valid: false, error: "Password is required" };
  }

  if (password.length < CONSTANTS.PASSWORD.MIN_LENGTH) {
    return {
      valid: false,
      error: `Password must be at least ${CONSTANTS.PASSWORD.MIN_LENGTH} characters`,
    };
  }

  return { valid: true, value: password };
}

/**
 * Validate module code
 */
function validateModuleCode(moduleCode) {
  if (!moduleCode || !moduleCode.trim()) {
    return { valid: false, error: "Module code is required" };
  }

  const cleanCode = sanitizeString(moduleCode.trim());

  if (cleanCode.length < 3) {
    return { valid: false, error: "Module code must be at least 3 characters" };
  }

  if (cleanCode.length > 50) {
    return { valid: false, error: "Module code must not exceed 50 characters" };
  }

  return { valid: true, value: cleanCode };
}

/**
 * Validate module name
 */
function validateModuleName(moduleName) {
  if (!moduleName || !moduleName.trim()) {
    return { valid: false, error: "Module name is required" };
  }

  const cleanName = sanitizeString(moduleName.trim());

  if (cleanName.length < 3) {
    return { valid: false, error: "Module name must be at least 3 characters" };
  }

  if (cleanName.length > 100) {
    return {
      valid: false,
      error: "Module name must not exceed 100 characters",
    };
  }

  return { valid: true, value: cleanName };
}

/**
 * Validate age range
 */
function validateAgeRange(minAge, maxAge) {
  const minValidation = validatePositiveInteger(minAge, "Minimum age");
  if (!minValidation.valid) {
    return minValidation;
  }

  const maxValidation = validatePositiveInteger(maxAge, "Maximum age");
  if (!maxValidation.valid) {
    return maxValidation;
  }

  const min = minValidation.value;
  const max = maxValidation.value;

  if (min < CONSTANTS.AGE_RANGE.MIN || min > CONSTANTS.AGE_RANGE.MAX) {
    return {
      valid: false,
      error: `Minimum age must be between ${CONSTANTS.AGE_RANGE.MIN} and ${CONSTANTS.AGE_RANGE.MAX}`,
    };
  }

  if (max < CONSTANTS.AGE_RANGE.MIN || max > CONSTANTS.AGE_RANGE.MAX) {
    return {
      valid: false,
      error: `Maximum age must be between ${CONSTANTS.AGE_RANGE.MIN} and ${CONSTANTS.AGE_RANGE.MAX}`,
    };
  }

  if (min > max) {
    return {
      valid: false,
      error: "Minimum age cannot be greater than maximum age",
    };
  }

  return { valid: true, minAge: min, maxAge: max };
}

module.exports = {
  sanitizeString,
  validatePositiveInteger,
  validateCertificateId,
  validateTeacherName,
  validateUsername,
  validateDivision,
  validateBranch,
  validatePassword,
  validateModuleCode,
  validateModuleName,
  validateAgeRange,
};
