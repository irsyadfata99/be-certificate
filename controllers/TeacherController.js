const pool = require("../config/database");
const bcrypt = require("bcrypt");
const { generatePassword } = require("../utils/passwordGenerator");
const logger = require("../utils/logger");
const CONSTANTS = require("../utils/constants");
const validators = require("../utils/validators");
const { sendError, sendSuccess } = require("../utils/responseHelper");

// =====================================================
// 1. CREATE TEACHER
// =====================================================
const createTeacher = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `SET LOCAL statement_timeout = '${CONSTANTS.TRANSACTION.TIMEOUT}'`,
    );

    logger.info("Create teacher request:", req.body);

    const {
      teacher_name: teacherName,
      teacher_division: teacherDivision,
      teacher_branch: teacherBranch,
      username,
    } = req.body;

    // Validate teacher_name
    const nameValidation = validators.validateTeacherName(teacherName);
    if (!nameValidation.valid) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        nameValidation.error,
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    // Validate username
    const usernameValidation = validators.validateUsername(username);
    if (!usernameValidation.valid) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        usernameValidation.error,
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    // Validate division
    const divisionValidation = validators.validateDivision(teacherDivision);
    if (!divisionValidation.valid) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        divisionValidation.error,
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    // Validate branch
    const branchValidation = validators.validateBranch(teacherBranch);
    if (!branchValidation.valid) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        branchValidation.error,
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    const cleanName = nameValidation.value;
    const cleanUsername = usernameValidation.value;
    const cleanDivision = divisionValidation.value;
    const cleanBranch = branchValidation.value;

    // Check if username already exists
    const checkExisting = await client.query(
      "SELECT * FROM users WHERE username = $1",
      [cleanUsername],
    );

    if (checkExisting.rows.length > 0) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.CONFLICT,
        "Username already exists",
        CONSTANTS.ERROR_CODES.DUPLICATE_ENTRY,
      );
    }

    // Generate random password
    const generatedPassword = generatePassword(
      CONSTANTS.PASSWORD.DEFAULT_GENERATED_LENGTH,
    );
    logger.info("Generated password for new teacher");

    // Hash password
    const hashedPassword = await bcrypt.hash(
      generatedPassword,
      CONSTANTS.PASSWORD.BCRYPT_ROUNDS,
    );

    // FIXED: Insert teacher WITHOUT default_password column
    const result = await client.query(
      `INSERT INTO users 
       (username, password, role, teacher_name, teacher_division, teacher_branch) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, username, teacher_name, teacher_division, teacher_branch, created_at`,
      [
        cleanUsername,
        hashedPassword,
        "teacher",
        cleanName,
        cleanDivision,
        cleanBranch,
      ],
    );

    await client.query("COMMIT");

    logger.info("Teacher created:", result.rows[0]);

    // FIXED: Return password ONLY in response (one-time display)
    const responseData = {
      ...result.rows[0],
      generatedPassword: generatedPassword, // Only in API response, NOT stored in DB
    };

    return sendSuccess(res, "Teacher created successfully", responseData);
  } catch (error) {
    await client.query("ROLLBACK");
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Failed to create teacher",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
  } finally {
    client.release();
  }
};

// =====================================================
// 2. GET ALL TEACHERS (WITH PAGINATION)
// =====================================================
const getAllTeachers = async (req, res) => {
  try {
    const {
      limit = CONSTANTS.PAGINATION.CERTIFICATES_DEFAULT_LIMIT,
      offset = CONSTANTS.PAGINATION.DEFAULT_OFFSET,
    } = req.query;

    const validatedLimit = Math.min(
      Math.max(
        parseInt(limit) || CONSTANTS.PAGINATION.CERTIFICATES_DEFAULT_LIMIT,
        1,
      ),
      CONSTANTS.PAGINATION.MAX_LIMIT,
    );
    const validatedOffset = Math.max(
      parseInt(offset) || CONSTANTS.PAGINATION.DEFAULT_OFFSET,
      0,
    );

    logger.info(
      `Get teachers: limit=${validatedLimit}, offset=${validatedOffset}`,
    );

    // FIXED: Remove default_password from SELECT
    const query = `
      SELECT 
        id, username, teacher_name, teacher_division, teacher_branch, 
        created_at, updated_at
      FROM users
      WHERE role = 'teacher'
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await pool.query(query, [validatedLimit, validatedOffset]);

    // Get total count
    const countResult = await pool.query(
      "SELECT COUNT(*) FROM users WHERE role = 'teacher'",
    );
    const totalCount = parseInt(countResult.rows[0].count);

    const pagination = {
      total: totalCount,
      limit: validatedLimit,
      offset: validatedOffset,
      hasMore: totalCount > validatedOffset + result.rows.length,
      currentPage: Math.floor(validatedOffset / validatedLimit) + 1,
      totalPages: Math.ceil(totalCount / validatedLimit),
    };

    logger.info(`Returned ${result.rows.length}/${totalCount} teachers`);

    return sendSuccess(res, "Teachers retrieved successfully", result.rows, {
      pagination,
      count: result.rows.length,
    });
  } catch (error) {
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Failed to retrieve teachers",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
  }
};

// =====================================================
// 3. GET TEACHER BY ID
// =====================================================
const getTeacherById = async (req, res) => {
  try {
    const { id } = req.params;

    const teacherId = parseInt(id);
    if (isNaN(teacherId)) {
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "Invalid teacher ID",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    // FIXED: Remove default_password from SELECT
    const result = await pool.query(
      `SELECT 
        id, username, teacher_name, teacher_division, teacher_branch, 
        created_at, updated_at
      FROM users 
      WHERE id = $1 AND role = 'teacher'`,
      [teacherId],
    );

    if (result.rows.length === 0) {
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.NOT_FOUND,
        "Teacher not found",
        CONSTANTS.ERROR_CODES.NOT_FOUND,
      );
    }

    return sendSuccess(res, "Teacher retrieved successfully", result.rows[0]);
  } catch (error) {
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Failed to retrieve teacher",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
  }
};

// =====================================================
// 4. UPDATE TEACHER
// =====================================================
const updateTeacher = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `SET LOCAL statement_timeout = '${CONSTANTS.TRANSACTION.TIMEOUT}'`,
    );

    const { id } = req.params;
    const {
      teacher_name: teacherName,
      teacher_division: teacherDivision,
      teacher_branch: teacherBranch,
      username,
      new_password: newPassword,
    } = req.body;

    const teacherId = parseInt(id);
    if (isNaN(teacherId)) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "Invalid teacher ID",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    logger.info("Update teacher request:", { id: teacherId, ...req.body });

    // Check if teacher exists
    const checkTeacher = await client.query(
      "SELECT * FROM users WHERE id = $1 AND role = 'teacher'",
      [teacherId],
    );

    if (checkTeacher.rows.length === 0) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.NOT_FOUND,
        "Teacher not found",
        CONSTANTS.ERROR_CODES.NOT_FOUND,
      );
    }

    const currentTeacher = checkTeacher.rows[0];

    // Validate fields if provided
    let cleanName = currentTeacher.teacher_name;
    if (teacherName !== undefined) {
      const nameValidation = validators.validateTeacherName(teacherName);
      if (!nameValidation.valid) {
        await client.query("ROLLBACK");
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.BAD_REQUEST,
          nameValidation.error,
          CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
        );
      }
      cleanName = nameValidation.value;
    }

    let cleanUsername = currentTeacher.username;
    if (username !== undefined) {
      const usernameValidation = validators.validateUsername(username);
      if (!usernameValidation.valid) {
        await client.query("ROLLBACK");
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.BAD_REQUEST,
          usernameValidation.error,
          CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
        );
      }
      cleanUsername = usernameValidation.value;

      // Check if new username already exists (for other users)
      if (cleanUsername !== currentTeacher.username) {
        const checkExisting = await client.query(
          "SELECT * FROM users WHERE username = $1 AND id != $2",
          [cleanUsername, teacherId],
        );

        if (checkExisting.rows.length > 0) {
          await client.query("ROLLBACK");
          return sendError(
            res,
            CONSTANTS.HTTP_STATUS.CONFLICT,
            "Username already exists",
            CONSTANTS.ERROR_CODES.DUPLICATE_ENTRY,
          );
        }
      }
    }

    let cleanDivision = currentTeacher.teacher_division;
    if (teacherDivision !== undefined) {
      const divisionValidation = validators.validateDivision(teacherDivision);
      if (!divisionValidation.valid) {
        await client.query("ROLLBACK");
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.BAD_REQUEST,
          divisionValidation.error,
          CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
        );
      }
      cleanDivision = divisionValidation.value;
    }

    let cleanBranch = currentTeacher.teacher_branch;
    if (teacherBranch !== undefined) {
      const branchValidation = validators.validateBranch(teacherBranch);
      if (!branchValidation.valid) {
        await client.query("ROLLBACK");
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.BAD_REQUEST,
          branchValidation.error,
          CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
        );
      }
      cleanBranch = branchValidation.value;
    }

    // Handle password update
    let hashedPassword = currentTeacher.password;

    if (newPassword && newPassword.trim()) {
      const passwordValidation = validators.validatePassword(newPassword);
      if (!passwordValidation.valid) {
        await client.query("ROLLBACK");
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.BAD_REQUEST,
          passwordValidation.error,
          CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
        );
      }
      hashedPassword = await bcrypt.hash(
        newPassword,
        CONSTANTS.PASSWORD.BCRYPT_ROUNDS,
      );
    }

    // FIXED: Update teacher WITHOUT default_password column
    const result = await client.query(
      `UPDATE users 
       SET username = $1, 
           teacher_name = $2, 
           teacher_division = $3, 
           teacher_branch = $4,
           password = $5,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING id, username, teacher_name, teacher_division, teacher_branch, created_at, updated_at`,
      [
        cleanUsername,
        cleanName,
        cleanDivision,
        cleanBranch,
        hashedPassword,
        teacherId,
      ],
    );

    await client.query("COMMIT");

    logger.info("Teacher updated:", result.rows[0]);

    return sendSuccess(res, "Teacher updated successfully", result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Failed to update teacher",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
  } finally {
    client.release();
  }
};

// =====================================================
// 5. DELETE TEACHER
// =====================================================
const deleteTeacher = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `SET LOCAL statement_timeout = '${CONSTANTS.TRANSACTION.TIMEOUT}'`,
    );

    const { id } = req.params;

    const teacherId = parseInt(id);
    if (isNaN(teacherId)) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "Invalid teacher ID",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    logger.info("Delete teacher request:", teacherId);

    // Check if teacher exists
    const checkTeacher = await client.query(
      "SELECT * FROM users WHERE id = $1 AND role = 'teacher'",
      [teacherId],
    );

    if (checkTeacher.rows.length === 0) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.NOT_FOUND,
        "Teacher not found",
        CONSTANTS.ERROR_CODES.NOT_FOUND,
      );
    }

    const teacher = checkTeacher.rows[0];

    // Delete teacher
    await client.query("DELETE FROM users WHERE id = $1", [teacherId]);

    await client.query("COMMIT");

    logger.info("Teacher deleted:", teacher.username);

    return sendSuccess(res, "Teacher deleted successfully", {
      id: teacher.id,
      username: teacher.username,
      teacher_name: teacher.teacher_name,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Failed to delete teacher",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
  } finally {
    client.release();
  }
};

module.exports = {
  createTeacher,
  getAllTeachers,
  getTeacherById,
  updateTeacher,
  deleteTeacher,
};
