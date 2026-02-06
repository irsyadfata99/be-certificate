// Certificate Print API Routes
// File: routes/printedCertificates.js

const express = require("express");
const router = express.Router();
const db = require("../db");
const { authenticateToken, requireRole } = require("../middleware/auth");

// ============================================================================
// GET /api/printed-certificates/modules
// Get all modules for dropdown (accessible by teachers)
// ============================================================================
router.get(
  "/modules",
  authenticateToken,
  requireRole(["teacher", "admin"]),
  async (req, res) => {
    try {
      const result = await db.query(
        `SELECT id, name, division, age_range 
             FROM modules 
             ORDER BY division, name`,
      );

      res.json({
        success: true,
        modules: result.rows,
      });
    } catch (error) {
      console.error("Error fetching modules:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch modules",
      });
    }
  },
);

// ============================================================================
// POST /api/printed-certificates
// Save printed certificate record
// ============================================================================
router.post(
  "/",
  authenticateToken,
  requireRole(["teacher", "admin"]),
  async (req, res) => {
    const { certificateId, studentName, moduleId, ptcDate } = req.body;
    const userId = req.user.userId;
    const userBranch = req.user.branch;

    // Validation
    if (!certificateId || !studentName || !moduleId || !ptcDate) {
      return res.status(400).json({
        success: false,
        message:
          "All fields are required: certificateId, studentName, moduleId, ptcDate",
      });
    }

    // Validate certificate ID not empty
    if (certificateId.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Certificate ID cannot be empty",
      });
    }

    // Validate student name not empty
    if (studentName.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Student name cannot be empty",
      });
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(ptcDate)) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format. Use YYYY-MM-DD",
      });
    }

    try {
      // Verify module exists
      const moduleCheck = await db.query(
        "SELECT id, name, division FROM modules WHERE id = $1",
        [moduleId],
      );

      if (moduleCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Module not found",
        });
      }

      // Insert printed certificate record
      const result = await db.query(
        `INSERT INTO printed_certificates 
             (certificate_id, student_name, module_id, ptc_date, printed_by, branch)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, certificate_id, student_name, module_id, ptc_date, printed_at, branch`,
        [
          certificateId.trim(),
          studentName.trim(),
          moduleId,
          ptcDate,
          userId,
          userBranch,
        ],
      );

      const savedRecord = result.rows[0];

      // Get module details for response
      const moduleDetails = moduleCheck.rows[0];

      res.status(201).json({
        success: true,
        message: "Certificate print record saved successfully",
        data: {
          id: savedRecord.id,
          certificateId: savedRecord.certificate_id,
          studentName: savedRecord.student_name,
          module: {
            id: moduleDetails.id,
            name: moduleDetails.name,
            division: moduleDetails.division,
          },
          ptcDate: savedRecord.ptc_date,
          printedAt: savedRecord.printed_at,
          branch: savedRecord.branch,
        },
      });
    } catch (error) {
      console.error("Error saving printed certificate:", error);
      res.status(500).json({
        success: false,
        message: "Failed to save certificate print record",
      });
    }
  },
);

// ============================================================================
// GET /api/printed-certificates/history
// Get printed certificates history (with pagination and filters)
// ============================================================================
router.get(
  "/history",
  authenticateToken,
  requireRole(["teacher", "admin"]),
  async (req, res) => {
    const {
      page = 1,
      limit = 10,
      search = "",
      moduleId,
      startDate,
      endDate,
    } = req.query;
    const offset = (page - 1) * limit;
    const userId = req.user.userId;
    const userRole = req.user.role;
    const userBranch = req.user.branch;

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
        // Admin sees all in their branch
        whereConditions.push(`pc.branch = $${paramCount}`);
        queryParams.push(userBranch);
        paramCount++;
      }

      // Search filter (student name or certificate ID)
      if (search) {
        whereConditions.push(
          `(LOWER(pc.student_name) LIKE LOWER($${paramCount}) OR LOWER(pc.certificate_id) LIKE LOWER($${paramCount}))`,
        );
        queryParams.push(`%${search}%`);
        paramCount++;
      }

      // Module filter
      if (moduleId) {
        whereConditions.push(`pc.module_id = $${paramCount}`);
        queryParams.push(moduleId);
        paramCount++;
      }

      // Date range filter
      if (startDate) {
        whereConditions.push(`pc.ptc_date >= $${paramCount}`);
        queryParams.push(startDate);
        paramCount++;
      }

      if (endDate) {
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
      const countResult = await db.query(countQuery, queryParams);
      const totalRecords = parseInt(countResult.rows[0].total);

      // Get paginated data with joins
      const dataQuery = `
            SELECT 
                pc.id,
                pc.certificate_id,
                pc.student_name,
                pc.ptc_date,
                pc.printed_at,
                pc.branch,
                m.id as module_id,
                m.name as module_name,
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
      const dataResult = await db.query(dataQuery, queryParams);

      res.json({
        success: true,
        data: dataResult.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalRecords / limit),
          totalRecords: totalRecords,
          recordsPerPage: parseInt(limit),
        },
      });
    } catch (error) {
      console.error("Error fetching printed certificates history:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch certificate history",
      });
    }
  },
);

// ============================================================================
// GET /api/printed-certificates/:id
// Get single printed certificate details (for re-print)
// ============================================================================
router.get(
  "/:id",
  authenticateToken,
  requireRole(["teacher", "admin"]),
  async (req, res) => {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;
    const userBranch = req.user.branch;

    try {
      let query, queryParams;

      if (userRole === "teacher") {
        // Teachers can only access their own prints
        query = `
                SELECT 
                    pc.id,
                    pc.certificate_id,
                    pc.student_name,
                    pc.ptc_date,
                    pc.printed_at,
                    pc.branch,
                    m.id as module_id,
                    m.name as module_name,
                    m.division as module_division
                FROM printed_certificates pc
                JOIN modules m ON pc.module_id = m.id
                WHERE pc.id = $1 AND pc.printed_by = $2
            `;
        queryParams = [id, userId];
      } else {
        // Admins can access all in their branch
        query = `
                SELECT 
                    pc.id,
                    pc.certificate_id,
                    pc.student_name,
                    pc.ptc_date,
                    pc.printed_at,
                    pc.branch,
                    m.id as module_id,
                    m.name as module_name,
                    m.division as module_division,
                    u.username as printed_by_username
                FROM printed_certificates pc
                JOIN modules m ON pc.module_id = m.id
                JOIN users u ON pc.printed_by = u.id
                WHERE pc.id = $1 AND pc.branch = $2
            `;
        queryParams = [id, userBranch];
      }

      const result = await db.query(query, queryParams);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Certificate record not found or access denied",
        });
      }

      res.json({
        success: true,
        data: result.rows[0],
      });
    } catch (error) {
      console.error("Error fetching certificate details:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch certificate details",
      });
    }
  },
);

module.exports = router;
