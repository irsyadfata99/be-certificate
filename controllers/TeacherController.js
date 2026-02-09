const pool = require("../config/database");
const logger = require("../utils/logger");
const CONSTANTS = require("../utils/constants");
const validators = require("../utils/validators");
const { sendError, sendSuccess } = require("../utils/responseHelper");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const TeacherController = {
  // Get all teachers with pagination and filters
  getAllTeachers: async (req, res) => {
    try {
      // Map snake_case to camelCase
      const { limit: limitParam = CONSTANTS.PAGINATION.DEFAULT_LIMIT, offset: offsetParam = CONSTANTS.PAGINATION.DEFAULT_OFFSET, search, division, branch } = req.query;

      // Pagination parameters
      const limit = Math.min(Math.max(parseInt(limitParam) || CONSTANTS.PAGINATION.DEFAULT_LIMIT, 1), CONSTANTS.PAGINATION.MAX_LIMIT);
      const offset = Math.max(parseInt(offsetParam) || CONSTANTS.PAGINATION.DEFAULT_OFFSET, 0);

      logger.debug("Get teachers with filters:", {
        limit,
        offset,
        search,
        division,
        branch,
      });

      // Build WHERE clause
      let whereConditions = ["role = 'teacher'"];
      let queryParams = [];
      let paramCount = 1;

      // Search filter (username OR teacher_name OR teacher_branch) - CASE INSENSITIVE
      if (search && search.trim()) {
        const searchTerm = `%${search.trim().toLowerCase()}%`;
        whereConditions.push(`(LOWER(username) LIKE $${paramCount} OR LOWER(teacher_name) LIKE $${paramCount} OR LOWER(teacher_branch) LIKE $${paramCount})`);
        queryParams.push(searchTerm);
        paramCount++;
        logger.debug("Search filter applied:", searchTerm);
      }

      // Division filter
      if (division && division.trim()) {
        const divisionValidation = validators.validateDivision(division);
        if (divisionValidation.valid) {
          whereConditions.push(`teacher_division = $${paramCount}`);
          queryParams.push(divisionValidation.value);
          paramCount++;
          logger.debug("Division filter applied:", divisionValidation.value);
        }
      }

      // Branch filter
      if (branch && branch.trim()) {
        whereConditions.push(`teacher_branch = $${paramCount}`);
        queryParams.push(branch.trim().toUpperCase());
        paramCount++;
        logger.debug("Branch filter applied:", branch.trim().toUpperCase());
      }

      const whereClause = "WHERE " + whereConditions.join(" AND ");

      logger.debug("WHERE clause:", whereClause);
      logger.debug("Query params:", queryParams);

      // Get total count with filters
      const countQuery = `SELECT COUNT(*) FROM users ${whereClause}`;
      logger.debug("Count query:", countQuery);

      const countResult = await pool.query(countQuery, queryParams);
      const totalTeachers = parseInt(countResult.rows[0].count);

      logger.debug("Total teachers matching filter:", totalTeachers);

      // Get paginated teachers with filters
      const dataQuery = `
        SELECT id, username, teacher_name, teacher_division, teacher_branch,
               created_at, updated_at
        FROM users
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramCount} OFFSET $${paramCount + 1}
      `;

      logger.debug("Data query:", dataQuery);

      const dataParams = [...queryParams, limit, offset];
      logger.debug("Data params:", dataParams);

      const result = await pool.query(dataQuery, dataParams);

      logger.info(`Returned ${result.rows.length}/${totalTeachers} teachers`);

      return sendSuccess(res, "Teachers retrieved successfully", result.rows, {
        pagination: {
          total: totalTeachers,
          limit: limit,
          offset: offset,
          hasMore: totalTeachers > offset + result.rows.length,
          currentPage: Math.floor(offset / limit) + 1,
          totalPages: Math.ceil(totalTeachers / limit),
        },
        filters: {
          search: search || null,
          division: division || null,
          branch: branch || null,
        },
        count: result.rows.length,
      });
    } catch (error) {
      return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to fetch teachers", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
    }
  },

  // Get single teacher by ID
  getTeacherById: async (req, res) => {
    try {
      const { id } = req.params;

      const teacherId = parseInt(id);
      if (isNaN(teacherId)) {
        return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Invalid teacher ID", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
      }

      const result = await pool.query(
        `SELECT id, username, teacher_name, teacher_division, teacher_branch,
                created_at, updated_at
         FROM users
         WHERE id = $1 AND role = 'teacher'`,
        [teacherId],
      );

      if (result.rows.length === 0) {
        return sendError(res, CONSTANTS.HTTP_STATUS.NOT_FOUND, "Teacher not found", CONSTANTS.ERROR_CODES.NOT_FOUND);
      }

      return sendSuccess(res, "Teacher retrieved successfully", result.rows[0]);
    } catch (error) {
      return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to fetch teacher", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
    }
  },

  // Create new teacher
  createTeacher: async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL statement_timeout = '${CONSTANTS.TRANSACTION.TIMEOUT}'`);

      const { username, teacher_name: teacherName, teacher_division: teacherDivision, teacher_branch: teacherBranch } = req.body;

      // Validation
      if (!username || !teacherName || !teacherDivision || !teacherBranch) {
        await client.query("ROLLBACK");
        return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "All fields are required", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
      }

      // Validate username
      const usernameValidation = validators.validateUsername(username);
      if (!usernameValidation.valid) {
        await client.query("ROLLBACK");
        return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, usernameValidation.error, CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
      }

      // Validate division
      const divisionValidation = validators.validateDivision(teacherDivision);
      if (!divisionValidation.valid) {
        await client.query("ROLLBACK");
        return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, divisionValidation.error, CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
      }

      const cleanUsername = usernameValidation.value;
      const cleanName = teacherName.trim();
      const cleanDivision = divisionValidation.value;
      const cleanBranch = teacherBranch.trim().toUpperCase();

      // Check if username already exists
      const existingUser = await client.query("SELECT id FROM users WHERE username = $1", [cleanUsername]);

      if (existingUser.rows.length > 0) {
        await client.query("ROLLBACK");
        return sendError(res, CONSTANTS.HTTP_STATUS.CONFLICT, "Username already exists", CONSTANTS.ERROR_CODES.DUPLICATE_ENTRY);
      }

      // Generate random password
      const generatedPassword = crypto.randomBytes(8).toString("hex").substring(0, 12);
      const hashedPassword = await bcrypt.hash(generatedPassword, 10);

      // Insert new teacher
      const result = await client.query(
        `INSERT INTO users (username, password, role, teacher_name, teacher_division, teacher_branch)
         VALUES ($1, $2, 'teacher', $3, $4, $5)
         RETURNING id, username, teacher_name, teacher_division, teacher_branch, created_at`,
        [cleanUsername, hashedPassword, cleanName, cleanDivision, cleanBranch],
      );

      await client.query("COMMIT");

      logger.info(`Teacher created: ${cleanUsername}`);

      return sendSuccess(res, "Teacher created successfully", {
        ...result.rows[0],
        generatedPassword, // Return password only once
      });
    } catch (error) {
      await client.query("ROLLBACK");

      // Handle specific PostgreSQL errors
      if (error.code === "23505") {
        // Unique violation
        return sendError(res, CONSTANTS.HTTP_STATUS.CONFLICT, "Username already exists", CONSTANTS.ERROR_CODES.DUPLICATE_ENTRY, error);
      } else {
        return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to create teacher", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
      }
    } finally {
      client.release();
    }
  },

  // Update teacher
  updateTeacher: async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL statement_timeout = '${CONSTANTS.TRANSACTION.TIMEOUT}'`);

      const { id } = req.params;

      const teacherId = parseInt(id);
      if (isNaN(teacherId)) {
        await client.query("ROLLBACK");
        return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Invalid teacher ID", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
      }

      const { username, teacher_name: teacherName, teacher_division: teacherDivision, teacher_branch: teacherBranch, new_password: newPassword } = req.body;

      // Validation
      if (!username || !teacherName || !teacherDivision || !teacherBranch) {
        await client.query("ROLLBACK");
        return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "All fields are required", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
      }

      // Validate username
      const usernameValidation = validators.validateUsername(username);
      if (!usernameValidation.valid) {
        await client.query("ROLLBACK");
        return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, usernameValidation.error, CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
      }

      // Validate division
      const divisionValidation = validators.validateDivision(teacherDivision);
      if (!divisionValidation.valid) {
        await client.query("ROLLBACK");
        return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, divisionValidation.error, CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
      }

      const cleanUsername = usernameValidation.value;
      const cleanName = teacherName.trim();
      const cleanDivision = divisionValidation.value;
      const cleanBranch = teacherBranch.trim().toUpperCase();

      // Check if teacher exists
      const existingTeacher = await client.query("SELECT id FROM users WHERE id = $1 AND role = 'teacher'", [teacherId]);

      if (existingTeacher.rows.length === 0) {
        await client.query("ROLLBACK");
        return sendError(res, CONSTANTS.HTTP_STATUS.NOT_FOUND, "Teacher not found", CONSTANTS.ERROR_CODES.NOT_FOUND);
      }

      // Check if new username is already used by another teacher
      const duplicateCheck = await client.query("SELECT id FROM users WHERE username = $1 AND id != $2", [cleanUsername, teacherId]);

      if (duplicateCheck.rows.length > 0) {
        await client.query("ROLLBACK");
        return sendError(res, CONSTANTS.HTTP_STATUS.CONFLICT, "Username already exists", CONSTANTS.ERROR_CODES.DUPLICATE_ENTRY);
      }

      // Update teacher (with or without password)
      let result;
      if (newPassword && newPassword.trim()) {
        const hashedPassword = await bcrypt.hash(newPassword.trim(), 10);
        result = await client.query(
          `UPDATE users
           SET username = $1, teacher_name = $2, teacher_division = $3, 
               teacher_branch = $4, password = $5, updated_at = CURRENT_TIMESTAMP
           WHERE id = $6
           RETURNING id, username, teacher_name, teacher_division, teacher_branch, updated_at`,
          [cleanUsername, cleanName, cleanDivision, cleanBranch, hashedPassword, teacherId],
        );
      } else {
        result = await client.query(
          `UPDATE users
           SET username = $1, teacher_name = $2, teacher_division = $3, 
               teacher_branch = $4, updated_at = CURRENT_TIMESTAMP
           WHERE id = $5
           RETURNING id, username, teacher_name, teacher_division, teacher_branch, updated_at`,
          [cleanUsername, cleanName, cleanDivision, cleanBranch, teacherId],
        );
      }

      await client.query("COMMIT");

      logger.info(`Teacher updated: ${cleanUsername}`);

      return sendSuccess(res, "Teacher updated successfully", result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");

      // Handle specific PostgreSQL errors
      if (error.code === "23505") {
        return sendError(res, CONSTANTS.HTTP_STATUS.CONFLICT, "Username already exists", CONSTANTS.ERROR_CODES.DUPLICATE_ENTRY, error);
      } else {
        return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to update teacher", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
      }
    } finally {
      client.release();
    }
  },

  // Delete teacher
  deleteTeacher: async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL statement_timeout = '${CONSTANTS.TRANSACTION.TIMEOUT}'`);

      const { id } = req.params;

      const teacherId = parseInt(id);
      if (isNaN(teacherId)) {
        await client.query("ROLLBACK");
        return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Invalid teacher ID", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
      }

      // Check if teacher exists
      const existingTeacher = await client.query("SELECT id, username FROM users WHERE id = $1 AND role = 'teacher'", [teacherId]);

      if (existingTeacher.rows.length === 0) {
        await client.query("ROLLBACK");
        return sendError(res, CONSTANTS.HTTP_STATUS.NOT_FOUND, "Teacher not found", CONSTANTS.ERROR_CODES.NOT_FOUND);
      }

      const teacherData = existingTeacher.rows[0];

      // Delete teacher
      await client.query("DELETE FROM users WHERE id = $1", [teacherId]);

      await client.query("COMMIT");

      logger.info(`Teacher deleted: ${teacherData.username}`);

      return sendSuccess(res, "Teacher deleted successfully");
    } catch (error) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to delete teacher", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
    } finally {
      client.release();
    }
  },

  // Get teacher statistics
  getTeacherStats: async (req, res) => {
    try {
      const stats = await pool.query(`
        SELECT 
          COUNT(*) as total_teachers,
          COUNT(CASE WHEN teacher_division = 'JK' THEN 1 END) as jk_teachers,
          COUNT(CASE WHEN teacher_division = 'LK' THEN 1 END) as lk_teachers,
          COUNT(CASE WHEN teacher_branch = 'SND' THEN 1 END) as snd_teachers,
          COUNT(CASE WHEN teacher_branch = 'MKW' THEN 1 END) as mkw_teachers,
          COUNT(CASE WHEN teacher_branch = 'KBP' THEN 1 END) as kbp_teachers
        FROM users
        WHERE role = 'teacher'
      `);

      return sendSuccess(res, "Teacher statistics retrieved successfully", stats.rows[0]);
    } catch (error) {
      return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to fetch teacher statistics", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
    }
  },
};

module.exports = TeacherController;
