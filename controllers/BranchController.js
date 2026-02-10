// controllers/BranchController.js
// Branch Management Controller - WITH REGIONAL HUB SUPPORT
// Version 2.0 - Multi-regional hub capability

const pool = require("../config/database");
const logger = require("../utils/logger");
const CONSTANTS = require("../utils/constants");
const validators = require("../utils/validators");
const { sendError, sendSuccess } = require("../utils/responseHelper");

// =====================================================
// 1. GET ALL BRANCHES - WITH REGIONAL HUB INFO
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
        b.is_head_branch,
        b.regional_hub,
        b.is_active,
        b.created_at,
        b.updated_at,
        hub.branch_name as hub_name,
        (SELECT COUNT(*) FROM students s WHERE s.branch_id = b.id AND s.status = 'active') as active_students_count,
        (SELECT COUNT(*) FROM teacher_branches tb WHERE tb.branch_id = b.id) as teachers_count,
        (SELECT COALESCE(SUM(cs.jumlah_sertifikat), 0) FROM certificate_stock cs WHERE cs.branch_code = b.branch_code) as total_certificates,
        (SELECT COALESCE(SUM(cs.jumlah_medali), 0) FROM certificate_stock cs WHERE cs.branch_code = b.branch_code) as total_medals
      FROM branches b
      LEFT JOIN branches hub ON b.regional_hub = hub.branch_code
    `;

    // Filter active branches only unless explicitly requested
    if (include_inactive !== "true") {
      query += " WHERE b.is_active = true";
    }

    // Order by: head branches first, then by regional hub, then by name
    query += " ORDER BY b.is_head_branch DESC, b.regional_hub, b.branch_name";

    const result = await pool.query(query);

    logger.info(`Retrieved ${result.rows.length} branches`);

    return sendSuccess(res, "Branches retrieved successfully", result.rows, {
      count: result.rows.length,
      filter: {
        include_inactive: include_inactive === "true",
      },
    });
  } catch (error) {
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Failed to retrieve branches",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
  }
};

// =====================================================
// 2. GET BRANCH BY ID - WITH REGIONAL HUB INFO
// =====================================================
const getBranchById = async (req, res) => {
  try {
    const { id } = req.params;

    const branchId = parseInt(id);
    if (isNaN(branchId)) {
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "Invalid branch ID",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    const result = await pool.query(
      `SELECT 
        b.id,
        b.branch_code,
        b.branch_name,
        b.is_head_branch,
        b.regional_hub,
        b.is_active,
        b.created_at,
        b.updated_at,
        hub.branch_name as hub_name,
        (SELECT COUNT(*) FROM students s WHERE s.branch_id = b.id AND s.status = 'active') as active_students_count,
        (SELECT COUNT(*) FROM students s WHERE s.branch_id = b.id AND s.status = 'inactive') as inactive_students_count,
        (SELECT COUNT(*) FROM teacher_branches tb WHERE tb.branch_id = b.id) as teachers_count,
        (SELECT COALESCE(SUM(cs.jumlah_sertifikat), 0) FROM certificate_stock cs WHERE cs.branch_code = b.branch_code) as total_certificates,
        (SELECT COALESCE(SUM(cs.jumlah_medali), 0) FROM certificate_stock cs WHERE cs.branch_code = b.branch_code) as total_medals,
        (SELECT json_agg(json_build_object(
          'id', u.id,
          'username', u.username,
          'teacher_name', u.teacher_name
        ) ORDER BY u.teacher_name)
         FROM teacher_branches tb
         JOIN users u ON tb.teacher_id = u.id
         WHERE tb.branch_id = b.id
        ) as teachers
       FROM branches b
       LEFT JOIN branches hub ON b.regional_hub = hub.branch_code
       WHERE b.id = $1`,
      [branchId],
    );

    if (result.rows.length === 0) {
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.NOT_FOUND,
        "Branch not found",
        CONSTANTS.ERROR_CODES.NOT_FOUND,
      );
    }

    return sendSuccess(res, "Branch retrieved successfully", result.rows[0]);
  } catch (error) {
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Failed to retrieve branch",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
  }
};

// =====================================================
// 3. CREATE BRANCH - WITH REGIONAL HUB SUPPORT
// =====================================================
const createBranch = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `SET LOCAL statement_timeout = '${CONSTANTS.TRANSACTION.TIMEOUT}'`,
    );

    const {
      branch_code: branchCode,
      branch_name: branchName,
      is_head_branch: isHeadBranch = false,
      regional_hub: regionalHub,
    } = req.body;

    logger.info("Create branch request:", {
      branchCode,
      branchName,
      isHeadBranch,
      regionalHub,
    });

    // ===== VALIDATION =====

    // Required fields
    if (!branchCode || !branchName) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "Branch code and name are required",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    const cleanCode = validators.sanitizeString(
      branchCode.trim().toUpperCase(),
    );
    const cleanName = validators.sanitizeString(branchName.trim());

    // Validate branch code format
    if (cleanCode.length < 2 || cleanCode.length > 10) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "Branch code must be 2-10 characters",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    if (!/^[A-Z0-9_-]+$/.test(cleanCode)) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "Branch code can only contain uppercase letters, numbers, dashes, and underscores",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    // Validate branch name
    if (cleanName.length < 3 || cleanName.length > 100) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "Branch name must be 3-100 characters",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    // ===== REGIONAL HUB VALIDATION =====

    // If head branch, regional_hub must be same as branch_code
    if (isHeadBranch && regionalHub && regionalHub !== cleanCode) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "Head branch must have regional_hub equal to its own branch_code",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    // If not head branch, regional_hub is required
    if (!isHeadBranch && !regionalHub) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "Non-head branch must specify a regional_hub",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    // If not head branch, verify regional_hub exists and is a head branch
    if (!isHeadBranch && regionalHub) {
      const hubCheck = await client.query(
        "SELECT branch_code, branch_name, is_head_branch, is_active FROM branches WHERE branch_code = $1",
        [regionalHub],
      );

      if (hubCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.NOT_FOUND,
          `Regional hub '${regionalHub}' not found`,
          CONSTANTS.ERROR_CODES.NOT_FOUND,
        );
      }

      if (!hubCheck.rows[0].is_head_branch) {
        await client.query("ROLLBACK");
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.BAD_REQUEST,
          `'${regionalHub}' is not a head branch. Only head branches can be regional hubs.`,
          CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
        );
      }

      if (!hubCheck.rows[0].is_active) {
        await client.query("ROLLBACK");
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.BAD_REQUEST,
          `Regional hub '${regionalHub}' is inactive`,
          CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
        );
      }
    }

    // Check if branch code already exists
    const existingBranch = await client.query(
      "SELECT id, branch_code FROM branches WHERE branch_code = $1",
      [cleanCode],
    );

    if (existingBranch.rows.length > 0) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.CONFLICT,
        "Branch code already exists",
        CONSTANTS.ERROR_CODES.DUPLICATE_ENTRY,
      );
    }

    // Check if branch name already exists
    const existingName = await client.query(
      "SELECT id, branch_name FROM branches WHERE LOWER(branch_name) = LOWER($1)",
      [cleanName],
    );

    if (existingName.rows.length > 0) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.CONFLICT,
        "Branch name already exists",
        CONSTANTS.ERROR_CODES.DUPLICATE_ENTRY,
      );
    }

    // ===== INSERT NEW BRANCH =====

    // If head branch, set regional_hub to self
    const finalRegionalHub = isHeadBranch ? cleanCode : regionalHub;

    const result = await client.query(
      `INSERT INTO branches (branch_code, branch_name, is_head_branch, regional_hub, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING *`,
      [cleanCode, cleanName, isHeadBranch, finalRegionalHub],
    );

    await client.query("COMMIT");

    logger.info(
      `Branch created successfully: ${cleanCode} - ${cleanName} ${isHeadBranch ? "(HEAD BRANCH)" : `(under ${finalRegionalHub})`}`,
    );

    return sendSuccess(res, "Branch created successfully", {
      ...result.rows[0],
      message: isHeadBranch
        ? "Head branch created. You can now input stock and manage regional operations."
        : `Branch created under ${finalRegionalHub} regional hub.`,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    // Handle specific PostgreSQL errors
    if (error.code === "23505") {
      // Unique violation
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.CONFLICT,
        "Branch code or name already exists",
        CONSTANTS.ERROR_CODES.DUPLICATE_ENTRY,
        error,
      );
    }

    if (error.code === "23503") {
      // Foreign key violation
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "Invalid regional hub specified",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
        error,
      );
    }

    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Failed to create branch",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
  } finally {
    client.release();
  }
};

// =====================================================
// 4. UPDATE BRANCH NAME (regional_hub tidak bisa diubah)
// =====================================================
const updateBranch = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `SET LOCAL statement_timeout = '${CONSTANTS.TRANSACTION.TIMEOUT}'`,
    );

    const { id } = req.params;
    const { branch_name: branchName } = req.body;

    const branchId = parseInt(id);
    if (isNaN(branchId)) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "Invalid branch ID",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    // Validation
    if (!branchName || !branchName.trim()) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "Branch name is required",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    const cleanName = validators.sanitizeString(branchName.trim());

    if (cleanName.length < 3 || cleanName.length > 100) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "Branch name must be 3-100 characters",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    // Check if branch exists
    const existingBranch = await client.query(
      "SELECT id, branch_code, branch_name FROM branches WHERE id = $1",
      [branchId],
    );

    if (existingBranch.rows.length === 0) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.NOT_FOUND,
        "Branch not found",
        CONSTANTS.ERROR_CODES.NOT_FOUND,
      );
    }

    // Check if new name already used by another branch
    const duplicateName = await client.query(
      "SELECT id FROM branches WHERE LOWER(branch_name) = LOWER($1) AND id != $2",
      [cleanName, branchId],
    );

    if (duplicateName.rows.length > 0) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.CONFLICT,
        "Branch name already exists",
        CONSTANTS.ERROR_CODES.DUPLICATE_ENTRY,
      );
    }

    // Update branch name only
    // Note: branch_code, is_head_branch, regional_hub CANNOT be changed
    const result = await client.query(
      `UPDATE branches 
       SET branch_name = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2
       RETURNING *`,
      [cleanName, branchId],
    );

    await client.query("COMMIT");

    logger.info(
      `Branch updated: ${existingBranch.rows[0].branch_code} - ${cleanName}`,
    );

    return sendSuccess(res, "Branch name updated successfully", result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Failed to update branch",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
  } finally {
    client.release();
  }
};

// =====================================================
// 5. TOGGLE BRANCH STATUS
// =====================================================
const toggleBranchStatus = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `SET LOCAL statement_timeout = '${CONSTANTS.TRANSACTION.TIMEOUT}'`,
    );

    const { id } = req.params;
    const { is_active: isActive } = req.body;

    const branchId = parseInt(id);
    if (isNaN(branchId)) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "Invalid branch ID",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    if (typeof isActive !== "boolean") {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "is_active must be a boolean (true/false)",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    // Check if branch exists
    const existingBranch = await client.query(
      "SELECT id, branch_code, branch_name, is_active, is_head_branch FROM branches WHERE id = $1",
      [branchId],
    );

    if (existingBranch.rows.length === 0) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.NOT_FOUND,
        "Branch not found",
        CONSTANTS.ERROR_CODES.NOT_FOUND,
      );
    }

    const branch = existingBranch.rows[0];

    // Check if already in desired state
    if (branch.is_active === isActive) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        `Branch is already ${isActive ? "active" : "inactive"}`,
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    // CRITICAL: If this is a head branch, check if there are active dependent branches
    if (!isActive && branch.is_head_branch) {
      const dependentBranches = await client.query(
        "SELECT COUNT(*) FROM branches WHERE regional_hub = $1 AND is_active = true AND branch_code != $1",
        [branch.branch_code],
      );

      const dependentCount = parseInt(dependentBranches.rows[0].count);

      if (dependentCount > 0) {
        await client.query("ROLLBACK");
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.BAD_REQUEST,
          `Cannot deactivate head branch. There are ${dependentCount} active branches under this regional hub. Please deactivate or reassign them first.`,
          CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
        );
      }
    }

    // If deactivating, check if there are active students
    if (!isActive) {
      const activeStudentsCheck = await client.query(
        "SELECT COUNT(*) FROM students WHERE branch_id = $1 AND status = 'active'",
        [branchId],
      );

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

    logger.info(
      `Branch ${isActive ? "activated" : "deactivated"}: ${branch.branch_code} - ${branch.branch_name}`,
    );

    return sendSuccess(
      res,
      `Branch ${isActive ? "activated" : "deactivated"} successfully`,
      result.rows[0],
    );
  } catch (error) {
    await client.query("ROLLBACK");
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Failed to toggle branch status",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
  } finally {
    client.release();
  }
};

// =====================================================
// 6. DELETE BRANCH
// =====================================================
const deleteBranch = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `SET LOCAL statement_timeout = '${CONSTANTS.TRANSACTION.TIMEOUT}'`,
    );

    const { id } = req.params;

    const branchId = parseInt(id);
    if (isNaN(branchId)) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "Invalid branch ID",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    // Check if branch exists
    const existingBranch = await client.query(
      "SELECT id, branch_code, branch_name, is_active, is_head_branch FROM branches WHERE id = $1",
      [branchId],
    );

    if (existingBranch.rows.length === 0) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.NOT_FOUND,
        "Branch not found",
        CONSTANTS.ERROR_CODES.NOT_FOUND,
      );
    }

    const branch = existingBranch.rows[0];

    // CRITICAL: If this is a head branch, check dependencies
    if (branch.is_head_branch) {
      const dependentBranches = await client.query(
        "SELECT COUNT(*) FROM branches WHERE regional_hub = $1 AND branch_code != $1",
        [branch.branch_code],
      );

      const dependentCount = parseInt(dependentBranches.rows[0].count);

      if (dependentCount > 0) {
        await client.query("ROLLBACK");
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.BAD_REQUEST,
          `Cannot delete head branch. There are ${dependentCount} branches under this regional hub. Please delete or reassign them first.`,
          CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
        );
      }
    }

    // Check for students
    const studentsCheck = await client.query(
      "SELECT COUNT(*) FROM students WHERE branch_id = $1",
      [branchId],
    );

    const studentCount = parseInt(studentsCheck.rows[0].count);

    if (studentCount > 0) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        `Cannot delete branch. There are ${studentCount} students (including inactive) in this branch. Please transfer them first.`,
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    // Check for certificate stock
    const stockCheck = await client.query(
      "SELECT COUNT(*) FROM certificate_stock WHERE branch_code = $1",
      [branch.branch_code],
    );

    const stockCount = parseInt(stockCheck.rows[0].count);

    if (stockCount > 0) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        `Cannot delete branch. There is certificate stock in this branch. Please migrate stock first.`,
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    // Check for teachers
    const teachersCheck = await client.query(
      "SELECT COUNT(*) FROM teacher_branches WHERE branch_id = $1",
      [branchId],
    );

    const teacherCount = parseInt(teachersCheck.rows[0].count);

    if (teacherCount > 0) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        `Cannot delete branch. There are ${teacherCount} teachers assigned to this branch. Please reassign them first.`,
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    // Safe to delete - no dependencies
    await client.query("DELETE FROM branches WHERE id = $1", [branchId]);

    await client.query("COMMIT");

    logger.info(
      `Branch deleted: ${branch.branch_code} - ${branch.branch_name}`,
    );

    return sendSuccess(res, "Branch deleted successfully");
  } catch (error) {
    await client.query("ROLLBACK");

    // Handle foreign key constraint violation
    if (error.code === "23503") {
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "Cannot delete branch. It is referenced by other records.",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
        error,
      );
    }

    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Failed to delete branch",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
  } finally {
    client.release();
  }
};

// =====================================================
// 7. GET BRANCH STATISTICS - WITH REGIONAL HUB BREAKDOWN
// =====================================================
const getBranchStats = async (req, res) => {
  try {
    // Overall branch stats
    const overallQuery = `
      SELECT 
        COUNT(*) as total_branches,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_branches,
        COUNT(CASE WHEN is_active = false THEN 1 END) as inactive_branches,
        COUNT(CASE WHEN is_head_branch = true THEN 1 END) as total_head_branches
      FROM branches
    `;
    const overallResult = await pool.query(overallQuery);

    // Total students across all branches
    const totalStudentsQuery = `
      SELECT COUNT(*) as total_students
      FROM students
      WHERE status = 'active'
    `;
    const totalStudentsResult = await pool.query(totalStudentsQuery);

    // Total teachers across all branches
    const totalTeachersQuery = `
      SELECT COUNT(DISTINCT teacher_id) as total_teachers
      FROM teacher_branches
    `;
    const totalTeachersResult = await pool.query(totalTeachersQuery);

    // Total stock across all branches
    const totalStockQuery = `
      SELECT 
        COALESCE(SUM(jumlah_sertifikat), 0) as total_certificates,
        COALESCE(SUM(jumlah_medali), 0) as total_medals
      FROM certificate_stock
    `;
    const totalStockResult = await pool.query(totalStockQuery);

    // Per-branch statistics
    const branchStatsQuery = `
      SELECT 
        b.id as branch_id,
        b.branch_code,
        b.branch_name,
        b.is_head_branch,
        b.regional_hub,
        b.is_active,
        COUNT(DISTINCT CASE WHEN s.status = 'active' THEN s.id END)::INTEGER as students,
        COUNT(DISTINCT tb.teacher_id)::INTEGER as teachers,
        COALESCE(SUM(cs.jumlah_sertifikat), 0)::INTEGER as stock
      FROM branches b
      LEFT JOIN students s ON b.id = s.branch_id
      LEFT JOIN teacher_branches tb ON b.id = tb.branch_id
      LEFT JOIN certificate_stock cs ON b.branch_code = cs.branch_code
      GROUP BY b.id, b.branch_code, b.branch_name, b.is_head_branch, b.regional_hub, b.is_active
      ORDER BY b.is_head_branch DESC, b.regional_hub, b.branch_name
    `;
    const branchStatsResult = await pool.query(branchStatsQuery);

    // Regional hub summary
    const regionalHubQuery = `
      SELECT 
        b.regional_hub,
        MAX(CASE WHEN b.is_head_branch THEN b.branch_name END) as hub_name,
        COUNT(DISTINCT b.id) as total_branches,
        COUNT(DISTINCT CASE WHEN b.is_active THEN b.id END) as active_branches,
        COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'active') as total_students,
        COUNT(DISTINCT tb.teacher_id) as total_teachers,
        COALESCE(SUM(cs.jumlah_sertifikat), 0)::INTEGER as total_stock
      FROM branches b
      LEFT JOIN students s ON b.id = s.branch_id
      LEFT JOIN teacher_branches tb ON b.id = tb.branch_id
      LEFT JOIN certificate_stock cs ON b.branch_code = cs.branch_code
      GROUP BY b.regional_hub
      ORDER BY b.regional_hub
    `;
    const regionalHubResult = await pool.query(regionalHubQuery);

    logger.info("Branch statistics generated successfully");

    return sendSuccess(res, "Branch statistics retrieved successfully", {
      // Overall totals
      total_students: parseInt(totalStudentsResult.rows[0].total_students) || 0,
      total_teachers: parseInt(totalTeachersResult.rows[0].total_teachers) || 0,
      total_stock: parseInt(totalStockResult.rows[0].total_certificates) || 0,

      // Branch counts
      total_branches: parseInt(overallResult.rows[0].total_branches) || 0,
      active_branches: parseInt(overallResult.rows[0].active_branches) || 0,
      inactive_branches: parseInt(overallResult.rows[0].inactive_branches) || 0,
      total_head_branches:
        parseInt(overallResult.rows[0].total_head_branches) || 0,

      // Per-branch details
      branches: branchStatsResult.rows,

      // Regional hub summary
      regional_hubs: regionalHubResult.rows,
    });
  } catch (error) {
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Failed to retrieve branch statistics",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
  }
};

// =====================================================
// 8. GET HEAD BRANCHES ONLY (for dropdown in forms)
// =====================================================
const getHeadBranches = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        id,
        branch_code,
        branch_name,
        is_active,
        created_at
      FROM branches
      WHERE is_head_branch = true AND is_active = true
      ORDER BY branch_name`,
    );

    logger.info(`Retrieved ${result.rows.length} head branches`);

    return sendSuccess(
      res,
      "Head branches retrieved successfully",
      result.rows,
    );
  } catch (error) {
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Failed to retrieve head branches",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
  }
};

// =====================================================
// 9. GET BRANCHES BY REGIONAL HUB (for filtering)
// =====================================================
const getBranchesByHub = async (req, res) => {
  try {
    const { hub } = req.params;

    if (!hub) {
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "Regional hub parameter is required",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    const result = await pool.query(
      `SELECT 
        id,
        branch_code,
        branch_name,
        is_head_branch,
        regional_hub,
        is_active
      FROM branches
      WHERE regional_hub = $1 AND is_active = true
      ORDER BY is_head_branch DESC, branch_name`,
      [hub],
    );

    logger.info(`Retrieved ${result.rows.length} branches for hub ${hub}`);

    return sendSuccess(
      res,
      `Branches for regional hub ${hub} retrieved successfully`,
      result.rows,
    );
  } catch (error) {
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Failed to retrieve branches by hub",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
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
  getHeadBranches,
  getBranchesByHub,
};
