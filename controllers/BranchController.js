// controllers/BranchController.js
// Branch Management Controller - Phase 3 (CREATE ENABLED)
// Handles branch CRUD operations with dynamic branch support

const pool = require("../config/database");
const logger = require("../utils/logger");
const CONSTANTS = require("../utils/constants");
const validators = require("../utils/validators");
const { sendError, sendSuccess } = require("../utils/responseHelper");

// =====================================================
// 1. GET ALL BRANCHES
// =====================================================
const getAllBranches = async (req, res) => {
  try {
    const { include_inactive } = req.query;

    logger.info("Get all branches request");

    let query = `
      SELECT 
        b.id,
        b.branch_code,
        b.branch_name,
        b.is_active,
        b.created_at,
        b.updated_at,
        (SELECT COUNT(*) FROM students s WHERE s.branch_code = b.branch_code AND s.status = 'active') as active_students_count,
        (SELECT COUNT(*) FROM teacher_branches tb WHERE tb.branch_code = b.branch_code) as teachers_count,
        (SELECT COALESCE(SUM(cs.jumlah_sertifikat), 0) FROM certificate_stock cs WHERE cs.branch_code = b.branch_code) as total_certificates,
        (SELECT COALESCE(SUM(cs.jumlah_medali), 0) FROM certificate_stock cs WHERE cs.branch_code = b.branch_code) as total_medals
      FROM branches b
    `;

    // Filter active branches only unless explicitly requested
    if (include_inactive !== "true") {
      query += " WHERE b.is_active = true";
    }

    query += " ORDER BY b.branch_name";

    const result = await pool.query(query);

    logger.info(`Retrieved ${result.rows.length} branches`);

    return sendSuccess(res, "Branches retrieved successfully", result.rows, {
      count: result.rows.length,
      filter: {
        include_inactive: include_inactive === "true",
      },
    });
  } catch (error) {
    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to retrieve branches", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  }
};

// =====================================================
// 2. GET BRANCH BY ID
// =====================================================
const getBranchById = async (req, res) => {
  try {
    const { id } = req.params;

    const branchId = parseInt(id);
    if (isNaN(branchId)) {
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Invalid branch ID", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    const result = await pool.query(
      `SELECT 
        b.id,
        b.branch_code,
        b.branch_name,
        b.is_active,
        b.created_at,
        b.updated_at,
        (SELECT COUNT(*) FROM students s WHERE s.branch_code = b.branch_code AND s.status = 'active') as active_students_count,
        (SELECT COUNT(*) FROM students s WHERE s.branch_code = b.branch_code AND s.status = 'inactive') as inactive_students_count,
        (SELECT COUNT(*) FROM teacher_branches tb WHERE tb.branch_code = b.branch_code) as teachers_count,
        (SELECT COALESCE(SUM(cs.jumlah_sertifikat), 0) FROM certificate_stock cs WHERE cs.branch_code = b.branch_code) as total_certificates,
        (SELECT COALESCE(SUM(cs.jumlah_medali), 0) FROM certificate_stock cs WHERE cs.branch_code = b.branch_code) as total_medals,
        (SELECT json_agg(json_build_object(
          'id', u.id,
          'username', u.username,
          'teacher_name', u.teacher_name
        ) ORDER BY u.teacher_name)
         FROM teacher_branches tb
         JOIN users u ON tb.teacher_id = u.id
         WHERE tb.branch_code = b.branch_code
        ) as teachers
       FROM branches b
       WHERE b.id = $1`,
      [branchId],
    );

    if (result.rows.length === 0) {
      return sendError(res, CONSTANTS.HTTP_STATUS.NOT_FOUND, "Branch not found", CONSTANTS.ERROR_CODES.NOT_FOUND);
    }

    return sendSuccess(res, "Branch retrieved successfully", result.rows[0]);
  } catch (error) {
    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to retrieve branch", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  }
};

// =====================================================
// 3. CREATE BRANCH (ENABLED)
// =====================================================
const createBranch = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL statement_timeout = '${CONSTANTS.TRANSACTION.TIMEOUT}'`);

    const { branch_code: branchCode, branch_name: branchName } = req.body;

    logger.info("Create branch request:", { branchCode, branchName });

    // Validation
    if (!branchCode || !branchName) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Branch code and name are required", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    const cleanCode = validators.sanitizeString(branchCode.trim().toUpperCase());
    const cleanName = validators.sanitizeString(branchName.trim());

    // Validate branch code format
    if (cleanCode.length < 2 || cleanCode.length > 10) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Branch code must be 2-10 characters", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    // Branch code should only contain letters and numbers
    if (!/^[A-Z0-9]+$/.test(cleanCode)) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Branch code can only contain uppercase letters and numbers", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    // Validate branch name
    if (cleanName.length < 3 || cleanName.length > 100) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Branch name must be 3-100 characters", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    // Check if branch code already exists
    const existingBranch = await client.query("SELECT id, branch_code FROM branches WHERE branch_code = $1", [cleanCode]);

    if (existingBranch.rows.length > 0) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.CONFLICT, "Branch code already exists", CONSTANTS.ERROR_CODES.DUPLICATE_ENTRY);
    }

    // Check if branch name already exists
    const existingName = await client.query("SELECT id, branch_name FROM branches WHERE LOWER(branch_name) = LOWER($1)", [cleanName]);

    if (existingName.rows.length > 0) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.CONFLICT, "Branch name already exists", CONSTANTS.ERROR_CODES.DUPLICATE_ENTRY);
    }

    // Insert new branch
    const result = await client.query(
      `INSERT INTO branches (branch_code, branch_name, is_active)
       VALUES ($1, $2, true)
       RETURNING *`,
      [cleanCode, cleanName],
    );

    await client.query("COMMIT");

    logger.info(`Branch created successfully: ${cleanCode} - ${cleanName}`);

    return sendSuccess(res, "Branch created successfully", {
      ...result.rows[0],
      message: "Branch created. Certificate stock will be automatically created when certificates are added to this branch.",
    });
  } catch (error) {
    await client.query("ROLLBACK");

    // Handle specific PostgreSQL errors
    if (error.code === "23505") {
      // Unique violation
      return sendError(res, CONSTANTS.HTTP_STATUS.CONFLICT, "Branch code or name already exists", CONSTANTS.ERROR_CODES.DUPLICATE_ENTRY, error);
    }

    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to create branch", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  } finally {
    client.release();
  }
};

// =====================================================
// 4. UPDATE BRANCH NAME
// =====================================================
const updateBranch = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL statement_timeout = '${CONSTANTS.TRANSACTION.TIMEOUT}'`);

    const { id } = req.params;
    const { branch_name: branchName } = req.body;

    const branchId = parseInt(id);
    if (isNaN(branchId)) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Invalid branch ID", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    // Validation
    if (!branchName || !branchName.trim()) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Branch name is required", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    const cleanName = validators.sanitizeString(branchName.trim());

    if (cleanName.length < 3 || cleanName.length > 100) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Branch name must be 3-100 characters", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    // Check if branch exists
    const existingBranch = await client.query("SELECT id, branch_code, branch_name FROM branches WHERE id = $1", [branchId]);

    if (existingBranch.rows.length === 0) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.NOT_FOUND, "Branch not found", CONSTANTS.ERROR_CODES.NOT_FOUND);
    }

    // Check if new name already used by another branch
    const duplicateName = await client.query("SELECT id FROM branches WHERE LOWER(branch_name) = LOWER($1) AND id != $2", [cleanName, branchId]);

    if (duplicateName.rows.length > 0) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.CONFLICT, "Branch name already exists", CONSTANTS.ERROR_CODES.DUPLICATE_ENTRY);
    }

    // Update branch name (branch_code cannot be changed for safety)
    const result = await client.query(
      `UPDATE branches 
       SET branch_name = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2
       RETURNING *`,
      [cleanName, branchId],
    );

    await client.query("COMMIT");

    logger.info(`Branch updated: ${existingBranch.rows[0].branch_code} - ${cleanName}`);

    return sendSuccess(res, "Branch name updated successfully", result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to update branch", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  } finally {
    client.release();
  }
};

// =====================================================
// 5. TOGGLE BRANCH STATUS (ACTIVATE/DEACTIVATE)
// =====================================================
const toggleBranchStatus = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL statement_timeout = '${CONSTANTS.TRANSACTION.TIMEOUT}'`);

    const { id } = req.params;
    const { is_active: isActive } = req.body;

    const branchId = parseInt(id);
    if (isNaN(branchId)) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Invalid branch ID", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    // Validation
    if (typeof isActive !== "boolean") {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "is_active must be a boolean (true/false)", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    // Check if branch exists
    const existingBranch = await client.query("SELECT id, branch_code, branch_name, is_active FROM branches WHERE id = $1", [branchId]);

    if (existingBranch.rows.length === 0) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.NOT_FOUND, "Branch not found", CONSTANTS.ERROR_CODES.NOT_FOUND);
    }

    const branch = existingBranch.rows[0];

    // Check if already in desired state
    if (branch.is_active === isActive) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, `Branch is already ${isActive ? "active" : "inactive"}`, CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    // If deactivating, check if there are active students
    if (!isActive) {
      const activeStudentsCheck = await client.query("SELECT COUNT(*) FROM students WHERE branch_code = $1 AND status = 'active'", [branch.branch_code]);

      const activeStudentsCount = parseInt(activeStudentsCheck.rows[0].count);

      if (activeStudentsCount > 0) {
        await client.query("ROLLBACK");
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.BAD_REQUEST,
          `Cannot deactivate branch. There are ${activeStudentsCount} active students in this branch. Please transfer or deactivate them first.`,
          CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
        );
      }
    }

    // Update branch status
    const result = await client.query(
      `UPDATE branches 
       SET is_active = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2
       RETURNING *`,
      [isActive, branchId],
    );

    await client.query("COMMIT");

    logger.info(`Branch ${isActive ? "activated" : "deactivated"}: ${branch.branch_code} - ${branch.branch_name}`);

    return sendSuccess(res, `Branch ${isActive ? "activated" : "deactivated"} successfully`, result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to toggle branch status", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  } finally {
    client.release();
  }
};

// =====================================================
// 6. DELETE BRANCH (Soft delete via deactivate)
// =====================================================
const deleteBranch = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL statement_timeout = '${CONSTANTS.TRANSACTION.TIMEOUT}'`);

    const { id } = req.params;

    const branchId = parseInt(id);
    if (isNaN(branchId)) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Invalid branch ID", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    // Check if branch exists
    const existingBranch = await client.query("SELECT id, branch_code, branch_name, is_active FROM branches WHERE id = $1", [branchId]);

    if (existingBranch.rows.length === 0) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.NOT_FOUND, "Branch not found", CONSTANTS.ERROR_CODES.NOT_FOUND);
    }

    const branch = existingBranch.rows[0];

    // Check for students
    const studentsCheck = await client.query("SELECT COUNT(*) FROM students WHERE branch_code = $1", [branch.branch_code]);

    const studentCount = parseInt(studentsCheck.rows[0].count);

    if (studentCount > 0) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, `Cannot delete branch. There are ${studentCount} students (including inactive) in this branch. Please transfer them first.`, CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    // Check for certificate stock
    const stockCheck = await client.query("SELECT COUNT(*) FROM certificate_stock WHERE branch_code = $1", [branch.branch_code]);

    const stockCount = parseInt(stockCheck.rows[0].count);

    if (stockCount > 0) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, `Cannot delete branch. There is certificate stock in this branch. Please migrate stock first.`, CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    // Check for teachers
    const teachersCheck = await client.query("SELECT COUNT(*) FROM teacher_branches WHERE branch_code = $1", [branch.branch_code]);

    const teacherCount = parseInt(teachersCheck.rows[0].count);

    if (teacherCount > 0) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, `Cannot delete branch. There are ${teacherCount} teachers assigned to this branch. Please reassign them first.`, CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    // Safe to delete - no dependencies
    await client.query("DELETE FROM branches WHERE id = $1", [branchId]);

    await client.query("COMMIT");

    logger.info(`Branch deleted: ${branch.branch_code} - ${branch.branch_name}`);

    return sendSuccess(res, "Branch deleted successfully");
  } catch (error) {
    await client.query("ROLLBACK");
    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to delete branch", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  } finally {
    client.release();
  }
};

// =====================================================
// 7. GET BRANCH STATISTICS
// =====================================================
const getBranchStats = async (req, res) => {
  try {
    const statsQuery = `
      SELECT 
        COUNT(*) as total_branches,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_branches,
        COUNT(CASE WHEN is_active = false THEN 1 END) as inactive_branches
      FROM branches
    `;

    const statsResult = await pool.query(statsQuery);

    // Get per-branch statistics
    const branchStatsQuery = `
      SELECT 
        b.id,
        b.branch_code,
        b.branch_name,
        b.is_active,
        COUNT(DISTINCT CASE WHEN s.status = 'active' THEN s.id END) as active_students,
        COUNT(DISTINCT CASE WHEN s.status = 'inactive' THEN s.id END) as inactive_students,
        COUNT(DISTINCT tb.teacher_id) as teachers_count,
        COUNT(DISTINCT sm.student_id) as students_with_completed_modules,
        COALESCE(SUM(cs.jumlah_sertifikat), 0) as total_certificates,
        COALESCE(SUM(cs.jumlah_medali), 0) as total_medals
      FROM branches b
      LEFT JOIN students s ON b.branch_code = s.branch_code
      LEFT JOIN teacher_branches tb ON b.branch_code = tb.branch_code
      LEFT JOIN student_modules sm ON s.id = sm.student_id
      LEFT JOIN certificate_stock cs ON b.branch_code = cs.branch_code
      GROUP BY b.id, b.branch_code, b.branch_name, b.is_active
      ORDER BY b.branch_name
    `;

    const branchStatsResult = await pool.query(branchStatsQuery);

    logger.info("Branch statistics generated successfully");

    return sendSuccess(res, "Branch statistics retrieved successfully", {
      overall: statsResult.rows[0],
      by_branch: branchStatsResult.rows,
    });
  } catch (error) {
    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to retrieve branch statistics", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  }
};

module.exports = {
  getAllBranches,
  getBranchById,
  createBranch,
  updateBranch,
  toggleBranchStatus,
  deleteBranch,
  getBranchStats,
};
