// controllers/PrintedCertificateController.js
// Handles certificate printing operations with automatic stock deduction

const pool = require("../config/database");
const logger = require("../utils/logger");
const CONSTANTS = require("../utils/constants");
const validators = require("../utils/validators");
const { sendError, sendSuccess } = require("../utils/responseHelper");

const PrintedCertificateController = {
  // =====================================================
  // 1. GET MODULES FOR DROPDOWN
  // =====================================================
  getModules: async (req, res) => {
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
  },

  // =====================================================
  // 2. SEARCH STUDENTS FOR AUTOCOMPLETE
  // =====================================================
  searchStudents: async (req, res) => {
    try {
      const { q: searchQuery, branch_code: branchCode, limit = 10 } = req.query;

      if (!searchQuery || !searchQuery.trim()) {
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.BAD_REQUEST,
          "Search query is required",
          CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
        );
      }

      const searchTerm = `%${searchQuery.trim().toLowerCase()}%`;
      const limitNum = Math.min(parseInt(limit) || 10, 50);

      let whereConditions = [
        "LOWER(s.student_name) LIKE $1",
        "s.status = 'active'",
      ];
      let queryParams = [searchTerm];
      let paramCount = 2;

      if (branchCode && branchCode.trim()) {
        whereConditions.push(`s.branch_code = $${paramCount}`);
        queryParams.push(branchCode.trim().toUpperCase());
        paramCount++;
      }

      const query = `
        SELECT 
          s.id,
          s.student_name,
          s.branch_code,
          b.branch_name
        FROM students s
        LEFT JOIN branches b ON s.branch_code = b.branch_code
        WHERE ${whereConditions.join(" AND ")}
        ORDER BY s.student_name
        LIMIT $${paramCount}
      `;

      queryParams.push(limitNum);
      const result = await pool.query(query, queryParams);

      logger.debug(
        `Search students: "${searchQuery}" - found ${result.rows.length} results`,
      );

      return sendSuccess(res, "Students found", result.rows, {
        count: result.rows.length,
        search_query: searchQuery,
      });
    } catch (error) {
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.SERVER_ERROR,
        "Failed to search students",
        CONSTANTS.ERROR_CODES.SERVER_ERROR,
        error,
      );
    }
  },

  // =====================================================
  // 3. SAVE PRINTED CERTIFICATE + DEDUCT STOCK
  // =====================================================
  savePrintRecord: async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `SET LOCAL statement_timeout = '${CONSTANTS.TRANSACTION.TIMEOUT}'`,
      );

      const {
        certificate_id: certificateId,
        student_name: studentName,
        student_id: studentId,
        module_id: moduleId,
        ptc_date: ptcDate,
      } = req.body;

      const userId = req.user.id;
      const userBranch = req.user.teacher_branch;

      // ===== VALIDATION =====
      if (!certificateId || !studentName || !moduleId || !ptcDate) {
        await client.query("ROLLBACK");
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
        await client.query("ROLLBACK");
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.BAD_REQUEST,
          certIdValidation.error,
          CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
        );
      }

      // Validate student name
      const cleanStudentName = validators.sanitizeString(studentName.trim());
      if (cleanStudentName.length < 3) {
        await client.query("ROLLBACK");
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
        await client.query("ROLLBACK");
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
        await client.query("ROLLBACK");
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.BAD_REQUEST,
          "Invalid date format. Use YYYY-MM-DD",
          CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
        );
      }

      // Validate student_id if provided
      let studentIdNum = null;
      if (studentId) {
        studentIdNum = parseInt(studentId);
        if (isNaN(studentIdNum)) {
          await client.query("ROLLBACK");
          return sendError(
            res,
            CONSTANTS.HTTP_STATUS.BAD_REQUEST,
            "Invalid student ID",
            CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
          );
        }
      }

      // ===== VERIFY MODULE EXISTS =====
      const moduleCheck = await client.query(
        "SELECT id, module_code, module_name, division FROM modules WHERE id = $1",
        [moduleIdNum],
      );

      if (moduleCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.NOT_FOUND,
          "Module not found",
          CONSTANTS.ERROR_CODES.NOT_FOUND,
        );
      }

      // ===== AUTO-LINK STUDENT IF NOT PROVIDED =====
      if (!studentIdNum) {
        const studentSearch = await client.query(
          `SELECT id FROM students 
           WHERE LOWER(student_name) = LOWER($1) 
           AND branch_code = $2 
           AND status = 'active'
           LIMIT 1`,
          [cleanStudentName, userBranch],
        );

        if (studentSearch.rows.length > 0) {
          studentIdNum = studentSearch.rows[0].id;
          logger.info(
            `Auto-linked student: ${cleanStudentName} (ID: ${studentIdNum})`,
          );
        }
      } else {
        // Verify student_id exists
        const studentCheck = await client.query(
          "SELECT id, student_name FROM students WHERE id = $1",
          [studentIdNum],
        );

        if (studentCheck.rows.length === 0) {
          await client.query("ROLLBACK");
          return sendError(
            res,
            CONSTANTS.HTTP_STATUS.NOT_FOUND,
            "Student not found",
            CONSTANTS.ERROR_CODES.NOT_FOUND,
          );
        }
      }

      // ===== CRITICAL: CHECK STOCK TERSEDIA =====
      const stockCheck = await client.query(
        `SELECT jumlah_medali 
         FROM certificate_stock 
         WHERE certificate_id = $1 AND branch_code = $2`,
        [certIdValidation.value, userBranch],
      );

      if (
        stockCheck.rows.length === 0 ||
        stockCheck.rows[0].jumlah_medali < 1
      ) {
        await client.query("ROLLBACK");
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.BAD_REQUEST,
          `Medal stock not available for batch ${certIdValidation.value} at branch ${userBranch}`,
          CONSTANTS.ERROR_CODES.INSUFFICIENT_STOCK,
        );
      }

      // ===== CRITICAL: KURANGI STOCK =====
      await client.query(
        `UPDATE certificate_stock 
         SET jumlah_medali = jumlah_medali - 1 
         WHERE certificate_id = $1 AND branch_code = $2`,
        [certIdValidation.value, userBranch],
      );

      // ===== INSERT PRINTED CERTIFICATE =====
      const result = await client.query(
        `INSERT INTO printed_certificates 
         (certificate_id, student_id, student_name, module_id, ptc_date, printed_by, branch)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, certificate_id, student_id, student_name, module_id, ptc_date, printed_at, branch`,
        [
          certIdValidation.value,
          studentIdNum,
          cleanStudentName,
          moduleIdNum,
          ptcDate,
          userId,
          userBranch,
        ],
      );

      // ===== LOG ACTIVITY =====
      await client.query(
        `INSERT INTO certificate_logs 
         (certificate_id, action_type, description, from_branch, medal_amount, performed_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          certIdValidation.value,
          "PRINT",
          `Medal printed for student: ${cleanStudentName}`,
          userBranch,
          -1,
          req.user?.username || "System",
        ],
      );

      await client.query("COMMIT");

      const savedRecord = result.rows[0];
      const moduleDetails = moduleCheck.rows[0];

      logger.info(
        `Certificate printed & stock deducted: ${cleanStudentName} - ${moduleDetails.module_code}${studentIdNum ? ` (Student ID: ${studentIdNum})` : " (Manual entry)"} at ${userBranch}`,
      );

      return sendSuccess(
        res,
        "Certificate print record saved and stock updated successfully",
        {
          id: savedRecord.id,
          certificateId: savedRecord.certificate_id,
          studentId: savedRecord.student_id,
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
          autoLinked: studentIdNum !== null && !studentId,
          stockDeducted: true,
        },
      );
    } catch (error) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.SERVER_ERROR,
        "Failed to save certificate print record",
        CONSTANTS.ERROR_CODES.SERVER_ERROR,
        error,
      );
    } finally {
      client.release();
    }
  },

  // =====================================================
  // 4. GET PRINT HISTORY WITH FILTERS
  // =====================================================
  getPrintHistory: async (req, res) => {
    try {
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

      // Build WHERE clause
      let whereConditions = [];
      let queryParams = [];
      let paramCount = 1;

      // Teachers: only their own prints | Admins: all in their branch
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

      // Date range filters
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
          pc.student_id,
          pc.student_name,
          pc.ptc_date,
          pc.printed_at,
          pc.branch,
          m.id as module_id,
          m.module_code,
          m.module_name,
          m.division as module_division,
          u.username as printed_by_username,
          CASE 
            WHEN pc.student_id IS NOT NULL THEN 
              (SELECT json_build_object(
                'id', s.id,
                'branch_code', s.branch_code,
                'status', s.status
              ) FROM students s WHERE s.id = pc.student_id)
            ELSE NULL
          END as student_info
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
  },

  // =====================================================
  // 5. GET SINGLE PRINT RECORD BY ID
  // =====================================================
  getPrintRecordById: async (req, res) => {
    try {
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

      let query, queryParams;

      if (userRole === "teacher") {
        query = `
          SELECT 
            pc.id,
            pc.certificate_id,
            pc.student_id,
            pc.student_name,
            pc.ptc_date,
            pc.printed_at,
            pc.branch,
            m.id as module_id,
            m.module_code,
            m.module_name,
            m.division as module_division,
            CASE 
              WHEN pc.student_id IS NOT NULL THEN 
                (SELECT json_build_object(
                  'id', s.id,
                  'branch_code', s.branch_code,
                  'status', s.status
                ) FROM students s WHERE s.id = pc.student_id)
              ELSE NULL
            END as student_info
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
            pc.student_id,
            pc.student_name,
            pc.ptc_date,
            pc.printed_at,
            pc.branch,
            m.id as module_id,
            m.module_code,
            m.module_name,
            m.division as module_division,
            u.username as printed_by_username,
            CASE 
              WHEN pc.student_id IS NOT NULL THEN 
                (SELECT json_build_object(
                  'id', s.id,
                  'branch_code', s.branch_code,
                  'status', s.status
                ) FROM students s WHERE s.id = pc.student_id)
              ELSE NULL
            END as student_info
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
  },
};

module.exports = PrintedCertificateController;
