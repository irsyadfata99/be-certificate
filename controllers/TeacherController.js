const pool = require("../config/database");
const logger = require("../utils/logger");
const CONSTANTS = require("../utils/constants");
const validators = require("../utils/validators");
const { sendError, sendSuccess } = require("../utils/responseHelper");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const TeacherController = {
  // Get all teachers with pagination and filters
  // UPDATED: Now includes branches & divisions arrays
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
      let whereConditions = ["u.role = 'teacher'"];
      let queryParams = [];
      let paramCount = 1;

      // Search filter (username OR teacher_name) - CASE INSENSITIVE
      if (search && search.trim()) {
        const searchTerm = `%${search.trim().toLowerCase()}%`;
        whereConditions.push(`(LOWER(u.username) LIKE $${paramCount} OR LOWER(u.teacher_name) LIKE $${paramCount})`);
        queryParams.push(searchTerm);
        paramCount++;
        logger.debug("Search filter applied:", searchTerm);
      }

      // UPDATED: Division filter - now checks in teacher_divisions table
      if (division && division.trim()) {
        const divisionValidation = validators.validateDivision(division);
        if (divisionValidation.valid) {
          whereConditions.push(`EXISTS (SELECT 1 FROM teacher_divisions td WHERE td.teacher_id = u.id AND td.division = $${paramCount})`);
          queryParams.push(divisionValidation.value);
          paramCount++;
          logger.debug("Division filter applied:", divisionValidation.value);
        }
      }

      // UPDATED: Branch filter - now checks in teacher_branches table
      if (branch && branch.trim()) {
        whereConditions.push(`EXISTS (SELECT 1 FROM teacher_branches tb JOIN branches b ON tb.branch_id = b.id WHERE tb.teacher_id = u.id AND b.branch_code = $${paramCount})`);
        queryParams.push(branch.trim().toUpperCase());
        paramCount++;
        logger.debug("Branch filter applied:", branch.trim().toUpperCase());
      }

      const whereClause = "WHERE " + whereConditions.join(" AND ");

      logger.debug("WHERE clause:", whereClause);
      logger.debug("Query params:", queryParams);

      // Get total count with filters
      const countQuery = `SELECT COUNT(*) FROM users u ${whereClause}`;
      logger.debug("Count query:", countQuery);

      const countResult = await pool.query(countQuery, queryParams);
      const totalTeachers = parseInt(countResult.rows[0].count);

      logger.debug("Total teachers matching filter:", totalTeachers);

      // UPDATED: Get paginated teachers with branches & divisions arrays
      const dataQuery = `
        SELECT 
          u.id, 
          u.username, 
          u.teacher_name,
          u.teacher_division as legacy_division,
          u.teacher_branch as legacy_branch,
          u.created_at, 
          u.updated_at,
          COALESCE(
            (SELECT json_agg(DISTINCT td.division ORDER BY td.division)
             FROM teacher_divisions td
             WHERE td.teacher_id = u.id),
            '[]'::json
          ) as divisions,
          COALESCE(
            (SELECT json_agg(json_build_object(
               'branch_id', b.id,
               'branch_code', b.branch_code,
               'branch_name', b.branch_name
             ) ORDER BY b.branch_name)
             FROM teacher_branches tb
             JOIN branches b ON tb.branch_id = b.id
             WHERE tb.teacher_id = u.id),
            '[]'::json
          ) as branches
        FROM users u
        ${whereClause}
        ORDER BY u.created_at DESC
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
  // UPDATED: Now includes branches & divisions arrays
  getTeacherById: async (req, res) => {
    try {
      const { id } = req.params;

      const teacherId = parseInt(id);
      if (isNaN(teacherId)) {
        return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Invalid teacher ID", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
      }

      // UPDATED: Include branches & divisions arrays
      const result = await pool.query(
        `SELECT 
          u.id, 
          u.username, 
          u.teacher_name,
          u.teacher_division as legacy_division,
          u.teacher_branch as legacy_branch,
          u.created_at, 
          u.updated_at,
          COALESCE(
            (SELECT json_agg(DISTINCT td.division ORDER BY td.division)
             FROM teacher_divisions td
             WHERE td.teacher_id = u.id),
            '[]'::json
          ) as divisions,
          COALESCE(
            (SELECT json_agg(json_build_object(
               'branch_id', b.id,
               'branch_code', b.branch_code,
               'branch_name', b.branch_name
             ) ORDER BY b.branch_name)
             FROM teacher_branches tb
             JOIN branches b ON tb.branch_id = b.id
             WHERE tb.teacher_id = u.id),
            '[]'::json
          ) as branches
         FROM users u
         WHERE u.id = $1 AND u.role = 'teacher'`,
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

  // UPDATED: Create new teacher - now handles multiple branches & divisions
  createTeacher: async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL statement_timeout = '${CONSTANTS.TRANSACTION.TIMEOUT}'`);

      const {
        username,
        teacher_name: teacherName,
        teacher_division: teacherDivision,
        teacher_branch: teacherBranch,
        // UPDATED: New fields for multi-assignment
        divisions, // array of 'JK', 'LK'
        branch_ids, // array of branch IDs
      } = req.body;

      // Validation
      if (!username || !teacherName) {
        await client.query("ROLLBACK");
        return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Username and teacher name are required", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
      }

      // UPDATED: For backward compatibility, accept either old fields OR new arrays
      const useDivisions = divisions && Array.isArray(divisions) && divisions.length > 0;
      const useBranchIds = branch_ids && Array.isArray(branch_ids) && branch_ids.length > 0;

      // If using old format, require old fields
      if (!useDivisions && !teacherDivision) {
        await client.query("ROLLBACK");
        return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Either teacher_division or divisions array is required", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
      }

      if (!useBranchIds && !teacherBranch) {
        await client.query("ROLLBACK");
        return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Either teacher_branch or branch_ids array is required", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
      }

      // Validate username
      const usernameValidation = validators.validateUsername(username);
      if (!usernameValidation.valid) {
        await client.query("ROLLBACK");
        return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, usernameValidation.error, CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
      }

      const cleanUsername = usernameValidation.value;
      const cleanName = teacherName.trim();

      // UPDATED: Validate divisions array
      let validatedDivisions = [];
      if (useDivisions) {
        for (const div of divisions) {
          const divValidation = validators.validateDivision(div);
          if (!divValidation.valid) {
            await client.query("ROLLBACK");
            return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, `Invalid division: ${div}`, CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
          }
          if (!validatedDivisions.includes(divValidation.value)) {
            validatedDivisions.push(divValidation.value);
          }
        }
      } else {
        // Use old single division
        const divValidation = validators.validateDivision(teacherDivision);
        if (!divValidation.valid) {
          await client.query("ROLLBACK");
          return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, divValidation.error, CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
        }
        validatedDivisions = [divValidation.value];
      }

      // UPDATED: Validate branch_ids array
      let validatedBranchIds = [];
      if (useBranchIds) {
        for (const branchId of branch_ids) {
          const branchIdNum = parseInt(branchId);
          if (isNaN(branchIdNum)) {
            await client.query("ROLLBACK");
            return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, `Invalid branch ID: ${branchId}`, CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
          }

          // Check if branch exists
          const branchCheck = await client.query("SELECT id, branch_code FROM branches WHERE id = $1", [branchIdNum]);
          if (branchCheck.rows.length === 0) {
            await client.query("ROLLBACK");
            return sendError(res, CONSTANTS.HTTP_STATUS.NOT_FOUND, `Branch not found: ${branchId}`, CONSTANTS.ERROR_CODES.NOT_FOUND);
          }

          if (!validatedBranchIds.includes(branchIdNum)) {
            validatedBranchIds.push(branchIdNum);
          }
        }
      } else {
        // Use old single branch - need to get branch_id from branch code
        const branchCode = teacherBranch.trim().toUpperCase();
        const branchCheck = await client.query("SELECT id FROM branches WHERE branch_code = $1", [branchCode]);
        if (branchCheck.rows.length === 0) {
          await client.query("ROLLBACK");
          return sendError(res, CONSTANTS.HTTP_STATUS.NOT_FOUND, `Branch not found: ${branchCode}`, CONSTANTS.ERROR_CODES.NOT_FOUND);
        }
        validatedBranchIds = [branchCheck.rows[0].id];
      }

      // Check if username already exists
      const existingUser = await client.query("SELECT id FROM users WHERE username = $1", [cleanUsername]);

      if (existingUser.rows.length > 0) {
        await client.query("ROLLBACK");
        return sendError(res, CONSTANTS.HTTP_STATUS.CONFLICT, "Username already exists", CONSTANTS.ERROR_CODES.DUPLICATE_ENTRY);
      }

      // Generate random password
      const generatedPassword = crypto.randomBytes(8).toString("hex").substring(0, 12);
      const hashedPassword = await bcrypt.hash(generatedPassword, 10);

      // UPDATED: Insert new teacher - keep legacy fields for backward compatibility
      const legacyDivision = validatedDivisions[0]; // Use first division as legacy
      const legacyBranchId = validatedBranchIds[0]; // Use first branch as legacy
      const legacyBranchResult = await client.query("SELECT branch_code FROM branches WHERE id = $1", [legacyBranchId]);
      const legacyBranch = legacyBranchResult.rows[0].branch_code;

      const result = await client.query(
        `INSERT INTO users (username, password, role, teacher_name, teacher_division, teacher_branch)
         VALUES ($1, $2, 'teacher', $3, $4, $5)
         RETURNING id, username, teacher_name, teacher_division, teacher_branch, created_at`,
        [cleanUsername, hashedPassword, cleanName, legacyDivision, legacyBranch],
      );

      const teacherId = result.rows[0].id;

      // UPDATED: Insert into teacher_divisions
      for (const division of validatedDivisions) {
        await client.query("INSERT INTO teacher_divisions (teacher_id, division) VALUES ($1, $2) ON CONFLICT DO NOTHING", [teacherId, division]);
      }

      // UPDATED: Insert into teacher_branches
      for (const branchId of validatedBranchIds) {
        await client.query("INSERT INTO teacher_branches (teacher_id, branch_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [teacherId, branchId]);
      }

      // Get full teacher data with arrays
      const fullTeacher = await client.query(
        `SELECT 
          u.id, 
          u.username, 
          u.teacher_name,
          u.teacher_division as legacy_division,
          u.teacher_branch as legacy_branch,
          u.created_at,
          COALESCE(
            (SELECT json_agg(DISTINCT td.division ORDER BY td.division)
             FROM teacher_divisions td
             WHERE td.teacher_id = u.id),
            '[]'::json
          ) as divisions,
          COALESCE(
            (SELECT json_agg(json_build_object(
               'branch_id', b.id,
               'branch_code', b.branch_code,
               'branch_name', b.branch_name
             ) ORDER BY b.branch_name)
             FROM teacher_branches tb
             JOIN branches b ON tb.branch_id = b.id
             WHERE tb.teacher_id = u.id),
            '[]'::json
          ) as branches
         FROM users u
         WHERE u.id = $1`,
        [teacherId],
      );

      await client.query("COMMIT");

      logger.info(`Teacher created: ${cleanUsername} with ${validatedDivisions.length} divisions and ${validatedBranchIds.length} branches`);

      return sendSuccess(res, "Teacher created successfully", {
        ...fullTeacher.rows[0],
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

  // UPDATED: Update teacher - now handles multiple branches & divisions
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

      const {
        username,
        teacher_name: teacherName,
        teacher_division: teacherDivision,
        teacher_branch: teacherBranch,
        new_password: newPassword,
        // UPDATED: New fields for multi-assignment
        divisions, // array of 'JK', 'LK'
        branch_ids, // array of branch IDs
      } = req.body;

      // Validation
      if (!username || !teacherName) {
        await client.query("ROLLBACK");
        return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Username and teacher name are required", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
      }

      // Validate username
      const usernameValidation = validators.validateUsername(username);
      if (!usernameValidation.valid) {
        await client.query("ROLLBACK");
        return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, usernameValidation.error, CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
      }

      const cleanUsername = usernameValidation.value;
      const cleanName = teacherName.trim();

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

      // UPDATED: Handle divisions update
      const useDivisions = divisions && Array.isArray(divisions) && divisions.length > 0;
      let validatedDivisions = [];
      let legacyDivision = teacherDivision;

      if (useDivisions) {
        for (const div of divisions) {
          const divValidation = validators.validateDivision(div);
          if (!divValidation.valid) {
            await client.query("ROLLBACK");
            return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, `Invalid division: ${div}`, CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
          }
          if (!validatedDivisions.includes(divValidation.value)) {
            validatedDivisions.push(divValidation.value);
          }
        }
        legacyDivision = validatedDivisions[0]; // Use first as legacy
      } else if (teacherDivision) {
        const divValidation = validators.validateDivision(teacherDivision);
        if (!divValidation.valid) {
          await client.query("ROLLBACK");
          return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, divValidation.error, CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
        }
        validatedDivisions = [divValidation.value];
        legacyDivision = divValidation.value;
      }

      // UPDATED: Handle branches update
      const useBranchIds = branch_ids && Array.isArray(branch_ids) && branch_ids.length > 0;
      let validatedBranchIds = [];
      let legacyBranch = teacherBranch;

      if (useBranchIds) {
        for (const branchId of branch_ids) {
          const branchIdNum = parseInt(branchId);
          if (isNaN(branchIdNum)) {
            await client.query("ROLLBACK");
            return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, `Invalid branch ID: ${branchId}`, CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
          }

          const branchCheck = await client.query("SELECT id, branch_code FROM branches WHERE id = $1", [branchIdNum]);
          if (branchCheck.rows.length === 0) {
            await client.query("ROLLBACK");
            return sendError(res, CONSTANTS.HTTP_STATUS.NOT_FOUND, `Branch not found: ${branchId}`, CONSTANTS.ERROR_CODES.NOT_FOUND);
          }

          if (!validatedBranchIds.includes(branchIdNum)) {
            validatedBranchIds.push(branchIdNum);
          }
        }
        // Get branch code for legacy field
        const legacyBranchResult = await client.query("SELECT branch_code FROM branches WHERE id = $1", [validatedBranchIds[0]]);
        legacyBranch = legacyBranchResult.rows[0].branch_code;
      } else if (teacherBranch) {
        const branchCode = teacherBranch.trim().toUpperCase();
        const branchCheck = await client.query("SELECT id FROM branches WHERE branch_code = $1", [branchCode]);
        if (branchCheck.rows.length === 0) {
          await client.query("ROLLBACK");
          return sendError(res, CONSTANTS.HTTP_STATUS.NOT_FOUND, `Branch not found: ${branchCode}`, CONSTANTS.ERROR_CODES.NOT_FOUND);
        }
        validatedBranchIds = [branchCheck.rows[0].id];
        legacyBranch = branchCode;
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
          [cleanUsername, cleanName, legacyDivision, legacyBranch, hashedPassword, teacherId],
        );
      } else {
        result = await client.query(
          `UPDATE users
           SET username = $1, teacher_name = $2, teacher_division = $3, 
               teacher_branch = $4, updated_at = CURRENT_TIMESTAMP
           WHERE id = $5
           RETURNING id, username, teacher_name, teacher_division, teacher_branch, updated_at`,
          [cleanUsername, cleanName, legacyDivision, legacyBranch, teacherId],
        );
      }

      // UPDATED: Update teacher_divisions if provided
      if (validatedDivisions.length > 0) {
        // Delete existing divisions
        await client.query("DELETE FROM teacher_divisions WHERE teacher_id = $1", [teacherId]);
        // Insert new divisions
        for (const division of validatedDivisions) {
          await client.query("INSERT INTO teacher_divisions (teacher_id, division) VALUES ($1, $2)", [teacherId, division]);
        }
      }

      // UPDATED: Update teacher_branches if provided
      if (validatedBranchIds.length > 0) {
        // Delete existing branches
        await client.query("DELETE FROM teacher_branches WHERE teacher_id = $1", [teacherId]);
        // Insert new branches
        for (const branchId of validatedBranchIds) {
          await client.query("INSERT INTO teacher_branches (teacher_id, branch_id) VALUES ($1, $2)", [teacherId, branchId]);
        }
      }

      // Get full teacher data with arrays
      const fullTeacher = await client.query(
        `SELECT 
          u.id, 
          u.username, 
          u.teacher_name,
          u.teacher_division as legacy_division,
          u.teacher_branch as legacy_branch,
          u.updated_at,
          COALESCE(
            (SELECT json_agg(DISTINCT td.division ORDER BY td.division)
             FROM teacher_divisions td
             WHERE td.teacher_id = u.id),
            '[]'::json
          ) as divisions,
          COALESCE(
            (SELECT json_agg(json_build_object(
               'branch_id', b.id,
               'branch_code', b.branch_code,
               'branch_name', b.branch_name
             ) ORDER BY b.branch_name)
             FROM teacher_branches tb
             JOIN branches b ON tb.branch_id = b.id
             WHERE tb.teacher_id = u.id),
            '[]'::json
          ) as branches
         FROM users u
         WHERE u.id = $1`,
        [teacherId],
      );

      await client.query("COMMIT");

      logger.info(`Teacher updated: ${cleanUsername}`);

      return sendSuccess(res, "Teacher updated successfully", fullTeacher.rows[0]);
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

  // Delete teacher - NO CHANGES NEEDED
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

      // Delete teacher (CASCADE will handle teacher_branches and teacher_divisions)
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

  // Get teacher statistics - NO CHANGES NEEDED
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
