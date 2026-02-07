// routes/printedCertificates.js
const express = require("express");
const router = express.Router();
const pool = require("../config/database");
const {
  verifyToken,
  requireAdmin,
  requireTeacher,
} = require("../auth/AuthMiddleware");
const logger = require("../utils/logger");
const CONSTANTS = require("../utils/constants");
const validators = require("../utils/validators");
const { sendError, sendSuccess } = require("../utils/responseHelper");

// =====================================================
// ALL ROUTES REQUIRE AUTHENTICATION
// =====================================================

// ============================================================================
// GET /api/printed-certificates/modules
// Get all modules for dropdown (accessible by teachers)
// ============================================================================
router.get("/modules", verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, module_code as name, division, min_age, max_age 
       FROM modules 
       ORDER BY division, module_code`,
    );

    return sendSuccess(res, "Modules retrieved successfully", result.rows);
  } catch (error) {
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Failed to fetch modules",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
  }
});

// ============================================================================
// POST /api/printed-certificates
// Save printed certificate record
// ============================================================================
router.post("/", verifyToken, async (req, res) => {
  const {
    certificate_id: certificateId,
    student_name: studentName,
    module_id: moduleId,
    ptc_date: ptcDate,
  } = req.body;

  const userId = req.user.id;
  const userBranch = req.user.teacher_branch;

  // Validation
  if (!certificateId || !studentName || !moduleId || !ptcDate) {
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.BAD_REQUEST,
      "All fields are required: certificateId, studentName, moduleId, ptcDate",
      CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
    );
  }

  // Validate certificate ID
  const certIdValidation = validators.validateCertificateId(certificateId);
  if (!certIdValidation.valid) {
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.BAD_REQUEST,
      certIdValidation.error,
      CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
    );
  }

  // Validate student name
  if (!studentName || !studentName.trim()) {
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.BAD_REQUEST,
      "Student name cannot be empty",
      CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
    );
  }

  const cleanStudentName = validators.sanitizeString(studentName.trim());

  if (cleanStudentName.length < 3) {
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.BAD_REQUEST,
      "Student name must be at least 3 characters",
      CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
    );
  }

  // Validate module ID
  const moduleIdNum = parseInt(moduleId);
  if (isNaN(moduleIdNum)) {
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.BAD_REQUEST,
      "Invalid module ID",
      CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
    );
  }

  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(ptcDate)) {
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.BAD_REQUEST,
      "Invalid date format. Use YYYY-MM-DD",
      CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
    );
  }

  try {
    // Verify module exists
    const moduleCheck = await pool.query(
      "SELECT id, module_code, module_name, division FROM modules WHERE id = $1",
      [moduleIdNum],
    );

    if (moduleCheck.rows.length === 0) {
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.NOT_FOUND,
        "Module not found",
        CONSTANTS.ERROR_CODES.NOT_FOUND,
      );
    }

    // Insert printed certificate record
    const result = await pool.query(
      `INSERT INTO printed_certificates 
       (certificate_id, student_name, module_id, ptc_date, printed_by, branch)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, certificate_id, student_name, module_id, ptc_date, printed_at, branch`,
      [
        certIdValidation.value,
        cleanStudentName,
        moduleIdNum,
        ptcDate,
        userId,
        userBranch,
      ],
    );

    const savedRecord = result.rows[0];
    const moduleDetails = moduleCheck.rows[0];

    return sendSuccess(res, "Certificate print record saved successfully", {
      id: savedRecord.id,
      certificateId: savedRecord.certificate_id,
      studentName: savedRecord.student_name,
      module: {
        id: moduleDetails.id,
        code: moduleDetails.module_code,
        name: moduleDetails.module_name,
        division: moduleDetails.division,
      },
      ptcDate: savedRecord.ptc_date,
      printedAt: savedRecord.printed_at,
      branch: savedRecord.branch,
    });
  } catch (error) {
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Failed to save certificate print record",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
  }
});

// ============================================================================
// GET /api/printed-certificates/history
// Get printed certificates history (with pagination and filters)
// ============================================================================
router.get("/history", verifyToken, async (req, res) => {
  const {
    page = 1,
    limit = CONSTANTS.PAGINATION.DEFAULT_LIMIT,
    search = "",
    module_id: moduleId,
    start_date: startDate,
    end_date: endDate,
  } = req.query;

  const offset = (page - 1) * limit;
  const userId = req.user.id;
  const userRole = req.user.role;
  const userBranch = req.user.teacher_branch;

  try {
    // Build WHERE clause
    let whereConditions = [];
    let queryParams = [];
    let paramCount = 1;

    // Teachers can only see their own prints, admins see all in their branch
    if (userRole === "teacher") {
      whereConditions.push(`pc.printed_by = $${paramCount}`);
      queryParams.push(userId);
      paramCount++;
    } else {
      whereConditions.push(`pc.branch = $${paramCount}`);
      queryParams.push(userBranch);
      paramCount++;
    }

    // Search filter
    if (search && search.trim()) {
      whereConditions.push(
        `(LOWER(pc.student_name) LIKE LOWER($${paramCount}) OR LOWER(pc.certificate_id) LIKE LOWER($${paramCount}))`,
      );
      queryParams.push(`%${search.trim()}%`);
      paramCount++;
    }

    // Module filter
    if (moduleId) {
      const moduleIdNum = parseInt(moduleId);
      if (!isNaN(moduleIdNum)) {
        whereConditions.push(`pc.module_id = $${paramCount}`);
        queryParams.push(moduleIdNum);
        paramCount++;
      }
    }

    // Date range filter
    if (startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      whereConditions.push(`pc.ptc_date >= $${paramCount}`);
      queryParams.push(startDate);
      paramCount++;
    }

    if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      whereConditions.push(`pc.ptc_date <= $${paramCount}`);
      queryParams.push(endDate);
      paramCount++;
    }

    const whereClause =
      whereConditions.length > 0
        ? "WHERE " + whereConditions.join(" AND ")
        : "";

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM printed_certificates pc
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, queryParams);
    const totalRecords = parseInt(countResult.rows[0].total);

    // Get paginated data
    const dataQuery = `
      SELECT 
        pc.id,
        pc.certificate_id,
        pc.student_name,
        pc.ptc_date,
        pc.printed_at,
        pc.branch,
        m.id as module_id,
        m.module_code,
        m.module_name,
        m.division as module_division,
        u.username as printed_by_username
      FROM printed_certificates pc
      JOIN modules m ON pc.module_id = m.id
      JOIN users u ON pc.printed_by = u.id
      ${whereClause}
      ORDER BY pc.printed_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    queryParams.push(limit, offset);
    const dataResult = await pool.query(dataQuery, queryParams);

    return sendSuccess(
      res,
      "Certificate history retrieved successfully",
      dataResult.rows,
      {
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalRecords / limit),
          totalRecords: totalRecords,
          recordsPerPage: parseInt(limit),
        },
      },
    );
  } catch (error) {
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Failed to fetch certificate history",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
  }
});

// ============================================================================
// GET /api/printed-certificates/:id
// Get single printed certificate details (for re-print)
// ============================================================================
router.get("/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;
  const userBranch = req.user.teacher_branch;

  const recordId = parseInt(id);
  if (isNaN(recordId)) {
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.BAD_REQUEST,
      "Invalid certificate record ID",
      CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
    );
  }

  try {
    let query, queryParams;

    if (userRole === "teacher") {
      query = `
        SELECT 
          pc.id,
          pc.certificate_id,
          pc.student_name,
          pc.ptc_date,
          pc.printed_at,
          pc.branch,
          m.id as module_id,
          m.module_code,
          m.module_name,
          m.division as module_division
        FROM printed_certificates pc
        JOIN modules m ON pc.module_id = m.id
        WHERE pc.id = $1 AND pc.printed_by = $2
      `;
      queryParams = [recordId, userId];
    } else {
      query = `
        SELECT 
          pc.id,
          pc.certificate_id,
          pc.student_name,
          pc.ptc_date,
          pc.printed_at,
          pc.branch,
          m.id as module_id,
          m.module_code,
          m.module_name,
          m.division as module_division,
          u.username as printed_by_username
        FROM printed_certificates pc
        JOIN modules m ON pc.module_id = m.id
        JOIN users u ON pc.printed_by = u.id
        WHERE pc.id = $1 AND pc.branch = $2
      `;
      queryParams = [recordId, userBranch];
    }

    const result = await pool.query(query, queryParams);

    if (result.rows.length === 0) {
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.NOT_FOUND,
        "Certificate record not found or access denied",
        CONSTANTS.ERROR_CODES.NOT_FOUND,
      );
    }

    return sendSuccess(
      res,
      "Certificate details retrieved successfully",
      result.rows[0],
    );
  } catch (error) {
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Failed to fetch certificate details",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
  }
});

module.exports = router;
