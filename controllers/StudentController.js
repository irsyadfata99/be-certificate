// controllers/StudentController.js
// Student Management Controller - Phase 1
// Handles CRUD operations for students with branch and division tracking

const pool = require("../config/database");
const logger = require("../utils/logger");
const CONSTANTS = require("../utils/constants");
const validators = require("../utils/validators");
const { sendError, sendSuccess } = require("../utils/responseHelper");

// =====================================================
// 1. CREATE STUDENT
// =====================================================
const createStudent = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL statement_timeout = '${CONSTANTS.TRANSACTION.TIMEOUT}'`);

    const { student_name: studentName, branch_id: branchId, division, date_of_birth: dateOfBirth, parent_name: parentName, parent_phone: parentPhone, parent_email: parentEmail, address, notes } = req.body;

    logger.info("Create student request:", { studentName, branchId, division });

    // Validation - Required fields
    if (!studentName || !branchId || !division) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Student name, branch, and division are required", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    // Validate student name
    const cleanName = validators.sanitizeString(studentName.trim());
    if (cleanName.length < 3) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Student name must be at least 3 characters", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    // Validate division
    const divisionValidation = validators.validateDivision(division);
    if (!divisionValidation.valid) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, divisionValidation.error, CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    const cleanDivision = divisionValidation.value;

    // Validate branch_id is integer
    const branchIdNum = parseInt(branchId);
    if (isNaN(branchIdNum)) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Invalid branch ID", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    // Check if branch exists and is active
    const branchCheck = await client.query("SELECT id, branch_name, is_active FROM branches WHERE id = $1", [branchIdNum]);

    if (branchCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.NOT_FOUND, "Branch not found", CONSTANTS.ERROR_CODES.NOT_FOUND);
    }

    if (!branchCheck.rows[0].is_active) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Cannot assign student to inactive branch", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    // Validate date_of_birth format if provided
    if (dateOfBirth) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(dateOfBirth)) {
        await client.query("ROLLBACK");
        return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Invalid date of birth format. Use YYYY-MM-DD", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
      }
    }

    // Validate email format if provided
    if (parentEmail && parentEmail.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(parentEmail.trim())) {
        await client.query("ROLLBACK");
        return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Invalid email format", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
      }
    }

    // Insert student
    const result = await client.query(
      `INSERT INTO students 
       (student_name, branch_id, division, date_of_birth, parent_name, 
        parent_phone, parent_email, address, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
       RETURNING *`,
      [
        cleanName,
        branchIdNum,
        cleanDivision,
        dateOfBirth || null,
        parentName ? validators.sanitizeString(parentName.trim()) : null,
        parentPhone ? validators.sanitizeString(parentPhone.trim()) : null,
        parentEmail ? validators.sanitizeString(parentEmail.trim()) : null,
        address ? validators.sanitizeString(address.trim()) : null,
        notes ? validators.sanitizeString(notes.trim()) : null,
      ],
    );

    await client.query("COMMIT");

    logger.info(`Student created: ${cleanName} (ID: ${result.rows[0].id})`);

    return sendSuccess(res, "Student created successfully", {
      ...result.rows[0],
      branch_name: branchCheck.rows[0].branch_name,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    // Handle specific PostgreSQL errors
    if (error.code === "23503") {
      // Foreign key violation
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Invalid branch reference", CONSTANTS.ERROR_CODES.VALIDATION_ERROR, error);
    }

    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to create student", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  } finally {
    client.release();
  }
};

// =====================================================
// 2. GET ALL STUDENTS (WITH PAGINATION & FILTERS)
// =====================================================
const getAllStudents = async (req, res) => {
  try {
    const { limit: limitParam = CONSTANTS.PAGINATION.DEFAULT_LIMIT, offset: offsetParam = CONSTANTS.PAGINATION.DEFAULT_OFFSET, search, branch_id: branchId, division, status } = req.query;

    // Validate pagination params
    const limit = Math.min(Math.max(parseInt(limitParam) || CONSTANTS.PAGINATION.DEFAULT_LIMIT, 1), CONSTANTS.PAGINATION.MAX_LIMIT);
    const offset = Math.max(parseInt(offsetParam) || CONSTANTS.PAGINATION.DEFAULT_OFFSET, 0);

    logger.debug("Get students with filters:", {
      limit,
      offset,
      search,
      branchId,
      division,
      status,
    });

    // Build WHERE clause
    let whereConditions = [];
    let queryParams = [];
    let paramCount = 1;

    // Search filter (student_name OR parent_name)
    if (search && search.trim()) {
      const searchTerm = `%${search.trim().toLowerCase()}%`;
      whereConditions.push(`(LOWER(s.student_name) LIKE $${paramCount} OR LOWER(s.parent_name) LIKE $${paramCount})`);
      queryParams.push(searchTerm);
      paramCount++;
    }

    // Branch filter
    if (branchId) {
      const branchIdNum = parseInt(branchId);
      if (!isNaN(branchIdNum)) {
        whereConditions.push(`s.branch_id = $${paramCount}`);
        queryParams.push(branchIdNum);
        paramCount++;
      }
    }

    // Division filter
    if (division && division.trim()) {
      const divisionValidation = validators.validateDivision(division);
      if (divisionValidation.valid) {
        whereConditions.push(`s.division = $${paramCount}`);
        queryParams.push(divisionValidation.value);
        paramCount++;
      }
    }

    // Status filter
    if (status && status.trim()) {
      const cleanStatus = status.trim().toLowerCase();
      if (cleanStatus === "active" || cleanStatus === "inactive") {
        whereConditions.push(`s.status = $${paramCount}`);
        queryParams.push(cleanStatus);
        paramCount++;
      }
    }

    const whereClause = whereConditions.length > 0 ? "WHERE " + whereConditions.join(" AND ") : "";

    // Get total count
    const countQuery = `
      SELECT COUNT(*) 
      FROM students s
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, queryParams);
    const totalCount = parseInt(countResult.rows[0].count);

    // Get paginated data with branch info
    const dataQuery = `
      SELECT 
        s.*,
        b.branch_name,
        b.branch_code,
        (SELECT COUNT(*) FROM student_modules sm WHERE sm.student_id = s.id) as completed_modules_count
      FROM students s
      LEFT JOIN branches b ON s.branch_id = b.id
      ${whereClause}
      ORDER BY s.created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    queryParams.push(limit, offset);
    const result = await pool.query(dataQuery, queryParams);

    logger.info(`Returned ${result.rows.length}/${totalCount} students`);

    return sendSuccess(res, "Students retrieved successfully", result.rows, {
      pagination: {
        total: totalCount,
        limit: limit,
        offset: offset,
        hasMore: totalCount > offset + result.rows.length,
        currentPage: Math.floor(offset / limit) + 1,
        totalPages: Math.ceil(totalCount / limit),
      },
      filters: {
        search: search || null,
        branchId: branchId || null,
        division: division || null,
        status: status || null,
      },
      count: result.rows.length,
    });
  } catch (error) {
    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to retrieve students", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  }
};

// =====================================================
// 3. GET STUDENT BY ID
// =====================================================
const getStudentById = async (req, res) => {
  try {
    const { id } = req.params;

    const studentId = parseInt(id);
    if (isNaN(studentId)) {
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Invalid student ID", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    const result = await pool.query(
      `SELECT 
        s.*,
        b.branch_name,
        b.branch_code,
        (SELECT COUNT(*) FROM student_modules sm WHERE sm.student_id = s.id) as completed_modules_count,
        (SELECT json_agg(json_build_object(
          'module_id', m.id,
          'module_code', m.module_code,
          'module_name', m.module_name,
          'completed_at', sm.completed_at
        ) ORDER BY sm.completed_at DESC)
         FROM student_modules sm
         JOIN modules m ON sm.module_id = m.id
         WHERE sm.student_id = s.id
        ) as completed_modules
      FROM students s
      LEFT JOIN branches b ON s.branch_id = b.id
      WHERE s.id = $1`,
      [studentId],
    );

    if (result.rows.length === 0) {
      return sendError(res, CONSTANTS.HTTP_STATUS.NOT_FOUND, "Student not found", CONSTANTS.ERROR_CODES.NOT_FOUND);
    }

    return sendSuccess(res, "Student retrieved successfully", result.rows[0]);
  } catch (error) {
    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to retrieve student", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  }
};

// =====================================================
// 4. UPDATE STUDENT
// =====================================================
const updateStudent = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL statement_timeout = '${CONSTANTS.TRANSACTION.TIMEOUT}'`);

    const { id } = req.params;
    const studentId = parseInt(id);

    if (isNaN(studentId)) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Invalid student ID", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    const { student_name: studentName, branch_id: branchId, division, date_of_birth: dateOfBirth, parent_name: parentName, parent_phone: parentPhone, parent_email: parentEmail, address, notes } = req.body;

    // Check if student exists
    const existingStudent = await client.query("SELECT id FROM students WHERE id = $1", [studentId]);

    if (existingStudent.rows.length === 0) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.NOT_FOUND, "Student not found", CONSTANTS.ERROR_CODES.NOT_FOUND);
    }

    // Validation - Required fields
    if (!studentName || !branchId || !division) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Student name, branch, and division are required", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    // Validate student name
    const cleanName = validators.sanitizeString(studentName.trim());
    if (cleanName.length < 3) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Student name must be at least 3 characters", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    // Validate division
    const divisionValidation = validators.validateDivision(division);
    if (!divisionValidation.valid) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, divisionValidation.error, CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    const cleanDivision = divisionValidation.value;

    // Validate branch_id
    const branchIdNum = parseInt(branchId);
    if (isNaN(branchIdNum)) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Invalid branch ID", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    // Check if branch exists and is active
    const branchCheck = await client.query("SELECT id, branch_name, is_active FROM branches WHERE id = $1", [branchIdNum]);

    if (branchCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.NOT_FOUND, "Branch not found", CONSTANTS.ERROR_CODES.NOT_FOUND);
    }

    // Validate date_of_birth if provided
    if (dateOfBirth) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(dateOfBirth)) {
        await client.query("ROLLBACK");
        return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Invalid date of birth format. Use YYYY-MM-DD", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
      }
    }

    // Validate email if provided
    if (parentEmail && parentEmail.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(parentEmail.trim())) {
        await client.query("ROLLBACK");
        return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Invalid email format", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
      }
    }

    // Update student
    const result = await client.query(
      `UPDATE students
       SET student_name = $1,
           branch_id = $2,
           division = $3,
           date_of_birth = $4,
           parent_name = $5,
           parent_phone = $6,
           parent_email = $7,
           address = $8,
           notes = $9,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $10
       RETURNING *`,
      [
        cleanName,
        branchIdNum,
        cleanDivision,
        dateOfBirth || null,
        parentName ? validators.sanitizeString(parentName.trim()) : null,
        parentPhone ? validators.sanitizeString(parentPhone.trim()) : null,
        parentEmail ? validators.sanitizeString(parentEmail.trim()) : null,
        address ? validators.sanitizeString(address.trim()) : null,
        notes ? validators.sanitizeString(notes.trim()) : null,
        studentId,
      ],
    );

    await client.query("COMMIT");

    logger.info(`Student updated: ${cleanName} (ID: ${studentId})`);

    return sendSuccess(res, "Student updated successfully", {
      ...result.rows[0],
      branch_name: branchCheck.rows[0].branch_name,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.code === "23503") {
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Invalid branch reference", CONSTANTS.ERROR_CODES.VALIDATION_ERROR, error);
    }

    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to update student", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  } finally {
    client.release();
  }
};

// =====================================================
// 5. DELETE STUDENT (SOFT DELETE)
// =====================================================
const deleteStudent = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL statement_timeout = '${CONSTANTS.TRANSACTION.TIMEOUT}'`);

    const { id } = req.params;
    const studentId = parseInt(id);

    if (isNaN(studentId)) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Invalid student ID", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    // Check if student exists
    const existingStudent = await client.query("SELECT id, student_name, status FROM students WHERE id = $1", [studentId]);

    if (existingStudent.rows.length === 0) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.NOT_FOUND, "Student not found", CONSTANTS.ERROR_CODES.NOT_FOUND);
    }

    const student = existingStudent.rows[0];

    if (student.status === "inactive") {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Student is already inactive", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    // Soft delete - set status to inactive
    await client.query("UPDATE students SET status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [studentId]);

    await client.query("COMMIT");

    logger.info(`Student soft deleted: ${student.student_name} (ID: ${studentId})`);

    return sendSuccess(res, "Student deleted successfully (set to inactive)");
  } catch (error) {
    await client.query("ROLLBACK");
    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to delete student", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  } finally {
    client.release();
  }
};

// =====================================================
// 6. TRANSFER STUDENT
// =====================================================
const transferStudent = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL statement_timeout = '${CONSTANTS.TRANSACTION.TIMEOUT}'`);

    const { id } = req.params;
    const { new_branch_id: newBranchId, transfer_reason: transferReason } = req.body;

    const studentId = parseInt(id);
    if (isNaN(studentId)) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Invalid student ID", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    if (!newBranchId) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "New branch ID is required", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    const newBranchIdNum = parseInt(newBranchId);
    if (isNaN(newBranchIdNum)) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Invalid new branch ID", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    // Get current student data
    const studentResult = await client.query(
      `SELECT s.*, b.branch_name as current_branch_name 
       FROM students s
       LEFT JOIN branches b ON s.branch_id = b.id
       WHERE s.id = $1`,
      [studentId],
    );

    if (studentResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.NOT_FOUND, "Student not found", CONSTANTS.ERROR_CODES.NOT_FOUND);
    }

    const student = studentResult.rows[0];

    // Check if trying to transfer to same branch
    if (student.branch_id === newBranchIdNum) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Student is already in this branch", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    // Check if new branch exists and is active
    const newBranchResult = await client.query("SELECT id, branch_name, is_active FROM branches WHERE id = $1", [newBranchIdNum]);

    if (newBranchResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.NOT_FOUND, "New branch not found", CONSTANTS.ERROR_CODES.NOT_FOUND);
    }

    if (!newBranchResult.rows[0].is_active) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Cannot transfer to inactive branch", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    const newBranch = newBranchResult.rows[0];

    // Record transfer in student_transfers table
    await client.query(
      `INSERT INTO student_transfers 
       (student_id, from_branch_id, to_branch_id, transfer_reason, transferred_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [studentId, student.branch_id, newBranchIdNum, transferReason ? validators.sanitizeString(transferReason.trim()) : null, req.user?.username || "System"],
    );

    // Update student's branch
    const updateResult = await client.query(
      `UPDATE students 
       SET branch_id = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2
       RETURNING *`,
      [newBranchIdNum, studentId],
    );

    await client.query("COMMIT");

    logger.info(`Student transferred: ${student.student_name} from ${student.current_branch_name} to ${newBranch.branch_name}`);

    return sendSuccess(res, "Student transferred successfully", {
      student: updateResult.rows[0],
      transfer: {
        from_branch: student.current_branch_name,
        to_branch: newBranch.branch_name,
        transfer_reason: transferReason || null,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to transfer student", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  } finally {
    client.release();
  }
};

// =====================================================
// 7. GET STUDENT STATISTICS
// =====================================================
const getStudentStats = async (req, res) => {
  try {
    const { branch_id: branchId } = req.query;

    let whereClause = "";
    let queryParams = [];

    if (branchId) {
      const branchIdNum = parseInt(branchId);
      if (!isNaN(branchIdNum)) {
        whereClause = "WHERE s.branch_id = $1";
        queryParams.push(branchIdNum);
      }
    }

    const statsQuery = `
      SELECT 
        COUNT(*) as total_students,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_students,
        COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive_students,
        COUNT(CASE WHEN division = 'JK' THEN 1 END) as jk_students,
        COUNT(CASE WHEN division = 'LK' THEN 1 END) as lk_students,
        (SELECT COUNT(*) FROM student_transfers ${whereClause.replace("s.branch_id", "to_branch_id")}) as total_transfers
      FROM students s
      ${whereClause}
    `;

    const statsResult = await pool.query(statsQuery, queryParams);

    // Get students by branch
    const branchStatsQuery = `
      SELECT 
        b.branch_name,
        b.branch_code,
        COUNT(s.id) as student_count,
        COUNT(CASE WHEN s.status = 'active' THEN 1 END) as active_count
      FROM branches b
      LEFT JOIN students s ON b.id = s.branch_id
      ${branchId ? "WHERE b.id = $1" : ""}
      GROUP BY b.id, b.branch_name, b.branch_code
      ORDER BY b.branch_name
    `;

    const branchStatsResult = await pool.query(branchStatsQuery, branchId ? queryParams : []);

    logger.info("Student statistics generated successfully");

    return sendSuccess(res, "Student statistics retrieved successfully", {
      overall: statsResult.rows[0],
      by_branch: branchStatsResult.rows,
    });
  } catch (error) {
    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to retrieve student statistics", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  }
};

// =====================================================
// 8. SEARCH STUDENTS (FOR AUTOCOMPLETE)
// =====================================================
const searchStudents = async (req, res) => {
  try {
    const { q: searchQuery, branch_id: branchId, limit = 10 } = req.query;

    if (!searchQuery || !searchQuery.trim()) {
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Search query is required", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    const searchTerm = `%${searchQuery.trim().toLowerCase()}%`;
    const limitNum = Math.min(parseInt(limit) || 10, 50);

    let whereConditions = ["LOWER(s.student_name) LIKE $1", "s.status = 'active'"];
    let queryParams = [searchTerm];
    let paramCount = 2;

    if (branchId) {
      const branchIdNum = parseInt(branchId);
      if (!isNaN(branchIdNum)) {
        whereConditions.push(`s.branch_id = $${paramCount}`);
        queryParams.push(branchIdNum);
        paramCount++;
      }
    }

    const query = `
      SELECT 
        s.id,
        s.student_name,
        s.division,
        s.branch_id,
        b.branch_name,
        b.branch_code
      FROM students s
      LEFT JOIN branches b ON s.branch_id = b.id
      WHERE ${whereConditions.join(" AND ")}
      ORDER BY s.student_name
      LIMIT $${paramCount}
    `;

    queryParams.push(limitNum);

    const result = await pool.query(query, queryParams);

    logger.debug(`Search students: "${searchQuery}" - found ${result.rows.length} results`);

    return sendSuccess(res, "Students found", result.rows, {
      count: result.rows.length,
      search_query: searchQuery,
    });
  } catch (error) {
    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to search students", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  }
};

module.exports = {
  createStudent,
  getAllStudents,
  getStudentById,
  updateStudent,
  deleteStudent,
  transferStudent,
  getStudentStats,
  searchStudents,
};
