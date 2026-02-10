// controllers/ExportController.js - UPDATED for Phase 4
// Added student export functions and regional hub filter for logs

const pool = require("../config/database");
const ExcelJS = require("exceljs");
const logger = require("../utils/logger");
const CONSTANTS = require("../utils/constants");
const { sendError } = require("../utils/responseHelper");

// =====================================================
// HELPER: Format Excel Header
// =====================================================
const formatHeader = (worksheet) => {
  worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4472C4" },
  };
  worksheet.getRow(1).alignment = {
    vertical: "middle",
    horizontal: "center",
  };
};

// =====================================================
// HELPER: Auto-fit Columns
// =====================================================
const autoFitColumns = (worksheet) => {
  worksheet.columns.forEach((column) => {
    let maxLength = 0;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const cellValue = cell.value ? cell.value.toString() : "";
      maxLength = Math.max(maxLength, cellValue.length);
    });
    column.width = Math.min(Math.max(maxLength + 2, 10), 50);
  });
};

// =====================================================
// 1. EXPORT CERTIFICATES (UPDATED for new structure)
// =====================================================
const exportCertificates = async (req, res) => {
  try {
    logger.info("Exporting certificates to Excel");

    // UPDATED: Use new certificate_stock table
    const result = await pool.query(`
      SELECT 
        c.certificate_id as "Batch ID",
        c.created_at as "Created At",
        c.updated_at as "Updated At",
        COALESCE(
          (SELECT json_agg(json_build_object(
            'branch', cs.branch_code,
            'certificates', cs.jumlah_sertifikat,
            'medals', cs.jumlah_medali
          ) ORDER BY cs.branch_code)
          FROM certificate_stock cs
          WHERE cs.certificate_id = c.certificate_id),
          '[]'::json
        ) as "Stock by Branch"
      FROM certificates c
      ORDER BY c.created_at DESC
    `);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Certificates");

    worksheet.columns = [
      { header: "Batch ID", key: "Batch ID", width: 15 },
      { header: "Stock by Branch", key: "Stock by Branch", width: 50 },
      { header: "Created At", key: "Created At", width: 20 },
      { header: "Updated At", key: "Updated At", width: 20 },
    ];

    result.rows.forEach((row) => {
      // Convert JSON to readable string
      const stockByBranch = JSON.parse(row["Stock by Branch"]);
      const stockStr = stockByBranch.map((s) => `${s.branch}: ${s.certificates} certs, ${s.medals} medals`).join("; ");

      worksheet.addRow({
        "Batch ID": row["Batch ID"],
        "Stock by Branch": stockStr,
        "Created At": row["Created At"],
        "Updated At": row["Updated At"],
      });
    });

    formatHeader(worksheet);
    autoFitColumns(worksheet);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=certificates_${new Date().toISOString().split("T")[0]}.xlsx`);

    await workbook.xlsx.write(res);
    logger.info("Certificates exported successfully");
    res.end();
  } catch (error) {
    logger.error("Export certificates error:", error);
    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to export certificates", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  }
};

// =====================================================
// 2. EXPORT CERTIFICATE LOGS (WITH REGIONAL HUB FILTER)
// =====================================================
const exportCertificateLogs = async (req, res) => {
  try {
    const { regional_hub: regionalHub } = req.query;

    logger.info("Exporting certificate logs to Excel", { regional_hub: regionalHub });

    let query = `
      SELECT 
        cl.certificate_id as "Certificate ID",
        cl.action_type as "Action Type",
        cl.description as "Description",
        cl.from_branch as "From Branch",
        cl.to_branch as "To Branch",
        cl.certificate_amount as "Certificate Amount",
        cl.medal_amount as "Medal Amount",
        cl.performed_by as "Performed By",
        cl.created_at as "Created At"
      FROM certificate_logs cl
    `;

    const params = [];
    let paramCount = 1;

    // Filter by regional hub if specified
    if (regionalHub && regionalHub.trim()) {
      query += `
        INNER JOIN certificate_stock cs ON cl.certificate_id = cs.certificate_id
        INNER JOIN branches b ON cs.branch_code = b.branch_code
        WHERE b.regional_hub = $${paramCount}
        GROUP BY cl.id, cl.certificate_id, cl.action_type, cl.description, 
                 cl.from_branch, cl.to_branch, cl.certificate_amount, 
                 cl.medal_amount, cl.performed_by, cl.created_at
      `;
      params.push(regionalHub.trim());
    }

    query += " ORDER BY cl.created_at DESC";

    const result = await pool.query(query, params);

    const workbook = new ExcelJS.Workbook();
    const worksheetName = regionalHub ? `Logs - ${regionalHub}` : "Certificate Logs";
    const worksheet = workbook.addWorksheet(worksheetName);

    worksheet.columns = [
      { header: "Certificate ID", key: "Certificate ID", width: 15 },
      { header: "Action Type", key: "Action Type", width: 15 },
      { header: "Description", key: "Description", width: 50 },
      { header: "From Branch", key: "From Branch", width: 12 },
      { header: "To Branch", key: "To Branch", width: 12 },
      { header: "Certificate Amount", key: "Certificate Amount", width: 18 },
      { header: "Medal Amount", key: "Medal Amount", width: 15 },
      { header: "Performed By", key: "Performed By", width: 15 },
      { header: "Created At", key: "Created At", width: 20 },
    ];

    result.rows.forEach((row) => {
      worksheet.addRow(row);
    });

    formatHeader(worksheet);
    autoFitColumns(worksheet);

    const filename = regionalHub ? `certificate_logs_${regionalHub}_${new Date().toISOString().split("T")[0]}.xlsx` : `certificate_logs_${new Date().toISOString().split("T")[0]}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);

    await workbook.xlsx.write(res);
    logger.info(`Certificate logs exported successfully${regionalHub ? ` for ${regionalHub}` : ""}`);
    res.end();
  } catch (error) {
    logger.error("Export certificate logs error:", error);
    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to export certificate logs", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  }
};

// =====================================================
// 3. EXPORT TEACHERS (UPDATED for multi-assignment)
// =====================================================
const exportTeachers = async (req, res) => {
  try {
    logger.info("Exporting teachers to Excel");

    // UPDATED: Include branches and divisions arrays
    const result = await pool.query(`
      SELECT 
        u.id as "ID",
        u.username as "Username",
        u.teacher_name as "Teacher Name",
        ARRAY_TO_STRING(
          ARRAY_AGG(DISTINCT td.division ORDER BY td.division), ', '
        ) as "Divisions",
        ARRAY_TO_STRING(
          ARRAY_AGG(DISTINCT tb.branch_code ORDER BY tb.branch_code), ', '
        ) as "Branches",
        u.created_at as "Created At",
        u.updated_at as "Updated At"
      FROM users u
      LEFT JOIN teacher_divisions td ON u.id = td.teacher_id
      LEFT JOIN teacher_branches tb ON u.id = tb.teacher_id
      WHERE u.role = 'teacher'
      GROUP BY u.id, u.username, u.teacher_name, u.created_at, u.updated_at
      ORDER BY u.created_at DESC
    `);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Teachers");

    worksheet.columns = [
      { header: "ID", key: "ID", width: 8 },
      { header: "Username", key: "Username", width: 15 },
      { header: "Teacher Name", key: "Teacher Name", width: 25 },
      { header: "Divisions", key: "Divisions", width: 15 },
      { header: "Branches", key: "Branches", width: 20 },
      { header: "Created At", key: "Created At", width: 20 },
      { header: "Updated At", key: "Updated At", width: 20 },
    ];

    result.rows.forEach((row) => {
      worksheet.addRow(row);
    });

    formatHeader(worksheet);
    autoFitColumns(worksheet);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=teachers_${new Date().toISOString().split("T")[0]}.xlsx`);

    await workbook.xlsx.write(res);
    logger.info("Teachers exported successfully");
    res.end();
  } catch (error) {
    logger.error("Export teachers error:", error);
    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to export teachers", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  }
};

// =====================================================
// 4. EXPORT MODULES
// =====================================================
const exportModules = async (req, res) => {
  try {
    logger.info("Exporting modules to Excel");

    const result = await pool.query(`
      SELECT 
        id as "ID",
        module_code as "Module Code",
        module_name as "Module Name",
        division as "Division",
        min_age as "Min Age",
        max_age as "Max Age",
        created_at as "Created At",
        updated_at as "Updated At"
      FROM modules
      ORDER BY division, module_code
    `);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Modules");

    worksheet.columns = [
      { header: "ID", key: "ID", width: 8 },
      { header: "Module Code", key: "Module Code", width: 15 },
      { header: "Module Name", key: "Module Name", width: 35 },
      { header: "Division", key: "Division", width: 10 },
      { header: "Min Age", key: "Min Age", width: 10 },
      { header: "Max Age", key: "Max Age", width: 10 },
      { header: "Created At", key: "Created At", width: 20 },
      { header: "Updated At", key: "Updated At", width: 20 },
    ];

    result.rows.forEach((row) => {
      worksheet.addRow(row);
    });

    formatHeader(worksheet);
    autoFitColumns(worksheet);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=modules_${new Date().toISOString().split("T")[0]}.xlsx`);

    await workbook.xlsx.write(res);
    logger.info("Modules exported successfully");
    res.end();
  } catch (error) {
    logger.error("Export modules error:", error);
    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to export modules", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  }
};

// =====================================================
// 5. EXPORT PRINTED CERTIFICATES (UPDATED with student_id)
// =====================================================
const exportPrintedCertificates = async (req, res) => {
  try {
    logger.info("Exporting printed certificates to Excel");

    const userRole = req.user.role;
    const userId = req.user.id;
    const userBranch = req.user.teacher_branch;

    let query = `
      SELECT 
        pc.id as "ID",
        pc.certificate_id as "Certificate ID",
        pc.student_name as "Student Name",
        pc.student_id as "Student ID",
        m.module_code as "Module Code",
        m.module_name as "Module Name",
        pc.ptc_date as "PTC Date",
        pc.branch as "Branch",
        u.username as "Printed By",
        pc.printed_at as "Printed At"
      FROM printed_certificates pc
      JOIN modules m ON pc.module_id = m.id
      JOIN users u ON pc.printed_by = u.id
    `;

    let queryParams = [];

    if (userRole === "teacher") {
      query += " WHERE pc.printed_by = $1";
      queryParams.push(userId);
    } else if (userRole === "admin" && userBranch) {
      query += " WHERE pc.branch = $1";
      queryParams.push(userBranch);
    }

    query += " ORDER BY pc.printed_at DESC";

    const result = await pool.query(query, queryParams);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Printed Certificates");

    worksheet.columns = [
      { header: "ID", key: "ID", width: 8 },
      { header: "Certificate ID", key: "Certificate ID", width: 15 },
      { header: "Student Name", key: "Student Name", width: 25 },
      { header: "Student ID", key: "Student ID", width: 12 },
      { header: "Module Code", key: "Module Code", width: 15 },
      { header: "Module Name", key: "Module Name", width: 35 },
      { header: "PTC Date", key: "PTC Date", width: 12 },
      { header: "Branch", key: "Branch", width: 10 },
      { header: "Printed By", key: "Printed By", width: 15 },
      { header: "Printed At", key: "Printed At", width: 20 },
    ];

    result.rows.forEach((row) => {
      worksheet.addRow(row);
    });

    formatHeader(worksheet);
    autoFitColumns(worksheet);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=printed_certificates_${new Date().toISOString().split("T")[0]}.xlsx`);

    await workbook.xlsx.write(res);
    logger.info("Printed certificates exported successfully");
    res.end();
  } catch (error) {
    logger.error("Export printed certificates error:", error);
    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to export printed certificates", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  }
};

// =====================================================
// NEW: 6. EXPORT STUDENTS
// =====================================================
const exportStudents = async (req, res) => {
  try {
    logger.info("Exporting students to Excel");

    const { branch_code: branchCode } = req.query;

    let query = `
      SELECT 
        s.id as "ID",
        s.student_name as "Student Name",
        s.branch_code as "Branch Code",
        b.branch_name as "Branch Name",
        s.status as "Status",
        COUNT(sm.id) as "Modules Completed",
        s.created_at as "Created At",
        s.updated_at as "Updated At"
      FROM students s
      LEFT JOIN branches b ON s.branch_code = b.branch_code
      LEFT JOIN student_modules sm ON s.id = sm.student_id
    `;

    let queryParams = [];

    if (branchCode && branchCode.trim()) {
      query += " WHERE s.branch_code = $1";
      queryParams.push(branchCode.trim().toUpperCase());
    }

    query += `
      GROUP BY s.id, s.student_name, s.branch_code, b.branch_name, s.status, s.created_at, s.updated_at
      ORDER BY s.branch_code, s.student_name
    `;

    const result = await pool.query(query, queryParams);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Students");

    worksheet.columns = [
      { header: "ID", key: "ID", width: 8 },
      { header: "Student Name", key: "Student Name", width: 30 },
      { header: "Branch Code", key: "Branch Code", width: 12 },
      { header: "Branch Name", key: "Branch Name", width: 25 },
      { header: "Status", key: "Status", width: 12 },
      { header: "Modules Completed", key: "Modules Completed", width: 18 },
      { header: "Created At", key: "Created At", width: 20 },
      { header: "Updated At", key: "Updated At", width: 20 },
    ];

    result.rows.forEach((row) => {
      worksheet.addRow(row);
    });

    formatHeader(worksheet);
    autoFitColumns(worksheet);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=students_${branchCode || "all"}_${new Date().toISOString().split("T")[0]}.xlsx`);

    await workbook.xlsx.write(res);
    logger.info("Students exported successfully");
    res.end();
  } catch (error) {
    logger.error("Export students error:", error);
    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to export students", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  }
};

// =====================================================
// NEW: 7. EXPORT STUDENTS BY BRANCH
// =====================================================
const exportStudentsByBranch = async (req, res) => {
  try {
    const { branch_code: branchCode } = req.params;

    if (!branchCode || !branchCode.trim()) {
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Branch code is required", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    logger.info(`Exporting students for branch: ${branchCode}`);

    const result = await pool.query(
      `SELECT 
        s.id as "ID",
        s.student_name as "Student Name",
        s.status as "Status",
        COUNT(sm.id) as "Modules Completed",
        ARRAY_TO_STRING(
          ARRAY_AGG(DISTINCT m.module_code ORDER BY m.module_code), ', '
        ) as "Completed Modules",
        s.created_at as "Enrolled At"
      FROM students s
      LEFT JOIN student_modules sm ON s.id = sm.student_id
      LEFT JOIN modules m ON sm.module_id = m.id
      WHERE s.branch_code = $1
      GROUP BY s.id, s.student_name, s.status, s.created_at
      ORDER BY s.student_name`,
      [branchCode.trim().toUpperCase()],
    );

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Students - ${branchCode}`);

    worksheet.columns = [
      { header: "ID", key: "ID", width: 8 },
      { header: "Student Name", key: "Student Name", width: 30 },
      { header: "Status", key: "Status", width: 12 },
      { header: "Modules Completed", key: "Modules Completed", width: 18 },
      { header: "Completed Modules", key: "Completed Modules", width: 50 },
      { header: "Enrolled At", key: "Enrolled At", width: 20 },
    ];

    result.rows.forEach((row) => {
      worksheet.addRow(row);
    });

    formatHeader(worksheet);
    autoFitColumns(worksheet);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=students_${branchCode}_${new Date().toISOString().split("T")[0]}.xlsx`);

    await workbook.xlsx.write(res);
    logger.info(`Students for branch ${branchCode} exported successfully`);
    res.end();
  } catch (error) {
    logger.error("Export students by branch error:", error);
    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to export students by branch", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  }
};

// =====================================================
// NEW: 8. EXPORT STUDENT TRANSFER HISTORY
// =====================================================
const exportStudentTransferHistory = async (req, res) => {
  try {
    logger.info("Exporting student transfer history to Excel");

    const result = await pool.query(`
      SELECT 
        st.id as "ID",
        s.student_name as "Student Name",
        st.from_branch as "From Branch",
        st.to_branch as "To Branch",
        st.transfer_date as "Transfer Date",
        u.username as "Transferred By",
        st.notes as "Notes",
        st.created_at as "Created At"
      FROM student_transfers st
      JOIN students s ON st.student_id = s.id
      JOIN users u ON st.transferred_by = u.id
      ORDER BY st.transfer_date DESC, st.created_at DESC
    `);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Student Transfers");

    worksheet.columns = [
      { header: "ID", key: "ID", width: 8 },
      { header: "Student Name", key: "Student Name", width: 30 },
      { header: "From Branch", key: "From Branch", width: 15 },
      { header: "To Branch", key: "To Branch", width: 15 },
      { header: "Transfer Date", key: "Transfer Date", width: 15 },
      { header: "Transferred By", key: "Transferred By", width: 15 },
      { header: "Notes", key: "Notes", width: 40 },
      { header: "Created At", key: "Created At", width: 20 },
    ];

    result.rows.forEach((row) => {
      worksheet.addRow(row);
    });

    formatHeader(worksheet);
    autoFitColumns(worksheet);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=student_transfers_${new Date().toISOString().split("T")[0]}.xlsx`);

    await workbook.xlsx.write(res);
    logger.info("Student transfer history exported successfully");
    res.end();
  } catch (error) {
    logger.error("Export student transfer history error:", error);
    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to export student transfer history", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  }
};

// =====================================================
// 9. EXPORT ALL DATA (MULTI-SHEET) - UPDATED
// =====================================================
const exportAllData = async (req, res) => {
  try {
    logger.info("Exporting all data to Excel (multi-sheet)");

    const workbook = new ExcelJS.Workbook();

    // Sheet 1: Stock Summary (UPDATED)
    const summaryResult = await pool.query(`
      SELECT 
        cs.branch_code as "Branch",
        b.branch_name as "Branch Name",
        COALESCE(SUM(cs.jumlah_sertifikat), 0) as "Certificates",
        COALESCE(SUM(cs.jumlah_medali), 0) as "Medals"
      FROM certificate_stock cs
      JOIN branches b ON cs.branch_code = b.branch_code
      GROUP BY cs.branch_code, b.branch_name
      ORDER BY cs.branch_code
    `);

    const summarySheet = workbook.addWorksheet("Stock Summary");
    summarySheet.columns = [
      { header: "Branch", key: "Branch", width: 12 },
      { header: "Branch Name", key: "Branch Name", width: 20 },
      { header: "Certificates", key: "Certificates", width: 15 },
      { header: "Medals", key: "Medals", width: 15 },
    ];
    summaryResult.rows.forEach((row) => summarySheet.addRow(row));
    formatHeader(summarySheet);

    // Sheet 2: Branches
    const branchesResult = await pool.query(`
      SELECT 
        branch_code as "Branch Code",
        branch_name as "Branch Name",
        is_active as "Active",
        created_at as "Created At"
      FROM branches
      ORDER BY branch_code
    `);

    const branchSheet = workbook.addWorksheet("Branches");
    branchSheet.columns = [
      { header: "Branch Code", key: "Branch Code", width: 12 },
      { header: "Branch Name", key: "Branch Name", width: 25 },
      { header: "Active", key: "Active", width: 10 },
      { header: "Created At", key: "Created At", width: 20 },
    ];
    branchesResult.rows.forEach((row) => branchSheet.addRow(row));
    formatHeader(branchSheet);

    // Sheet 3: Students
    const studentsResult = await pool.query(`
      SELECT 
        student_name as "Student Name",
        branch_code as "Branch",
        status as "Status",
        created_at as "Created At"
      FROM students
      ORDER BY branch_code, student_name
    `);

    const studentSheet = workbook.addWorksheet("Students");
    studentSheet.columns = [
      { header: "Student Name", key: "Student Name", width: 30 },
      { header: "Branch", key: "Branch", width: 10 },
      { header: "Status", key: "Status", width: 12 },
      { header: "Created At", key: "Created At", width: 20 },
    ];
    studentsResult.rows.forEach((row) => studentSheet.addRow(row));
    formatHeader(studentSheet);

    // Sheet 4: Teachers (UPDATED)
    const teachersResult = await pool.query(`
      SELECT 
        u.username as "Username",
        u.teacher_name as "Teacher Name",
        ARRAY_TO_STRING(
          ARRAY_AGG(DISTINCT td.division ORDER BY td.division), ', '
        ) as "Divisions",
        ARRAY_TO_STRING(
          ARRAY_AGG(DISTINCT tb.branch_code ORDER BY tb.branch_code), ', '
        ) as "Branches",
        u.created_at as "Created At"
      FROM users u
      LEFT JOIN teacher_divisions td ON u.id = td.teacher_id
      LEFT JOIN teacher_branches tb ON u.id = tb.teacher_id
      WHERE u.role = 'teacher'
      GROUP BY u.id, u.username, u.teacher_name, u.created_at
      ORDER BY u.teacher_name
    `);

    const teacherSheet = workbook.addWorksheet("Teachers");
    teacherSheet.columns = [
      { header: "Username", key: "Username", width: 15 },
      { header: "Teacher Name", key: "Teacher Name", width: 25 },
      { header: "Divisions", key: "Divisions", width: 15 },
      { header: "Branches", key: "Branches", width: 20 },
      { header: "Created At", key: "Created At", width: 20 },
    ];
    teachersResult.rows.forEach((row) => teacherSheet.addRow(row));
    formatHeader(teacherSheet);

    // Sheet 5: Modules
    const modulesResult = await pool.query(`
      SELECT 
        module_code as "Module Code",
        module_name as "Module Name",
        division as "Division",
        min_age as "Min Age",
        max_age as "Max Age"
      FROM modules
      ORDER BY division, module_code
    `);

    const moduleSheet = workbook.addWorksheet("Modules");
    moduleSheet.columns = [
      { header: "Module Code", key: "Module Code", width: 15 },
      { header: "Module Name", key: "Module Name", width: 35 },
      { header: "Division", key: "Division", width: 10 },
      { header: "Min Age", key: "Min Age", width: 10 },
      { header: "Max Age", key: "Max Age", width: 10 },
    ];
    modulesResult.rows.forEach((row) => moduleSheet.addRow(row));
    formatHeader(moduleSheet);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=certificate_system_export_${new Date().toISOString().split("T")[0]}.xlsx`);

    await workbook.xlsx.write(res);
    logger.info("All data exported successfully");
    res.end();
  } catch (error) {
    logger.error("Export all data error:", error);
    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to export all data", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  }
};

module.exports = {
  exportCertificates,
  exportCertificateLogs,
  exportTeachers,
  exportModules,
  exportPrintedCertificates,
  exportStudents, // NEW
  exportStudentsByBranch, // NEW
  exportStudentTransferHistory, // NEW
  exportAllData,
};
