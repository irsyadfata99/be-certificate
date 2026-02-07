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
// 1. EXPORT CERTIFICATES
// =====================================================
const exportCertificates = async (req, res) => {
  try {
    logger.info("Exporting certificates to Excel");

    const result = await pool.query(`
      SELECT 
        certificate_id as "Batch ID",
        jumlah_sertifikat_snd as "SND Certificates",
        jumlah_medali_snd as "SND Medals",
        jumlah_sertifikat_mkw as "MKW Certificates",
        jumlah_medali_mkw as "MKW Medals",
        jumlah_sertifikat_kbp as "KBP Certificates",
        jumlah_medali_kbp as "KBP Medals",
        (jumlah_sertifikat_snd + jumlah_sertifikat_mkw + jumlah_sertifikat_kbp) as "Total Certificates",
        (jumlah_medali_snd + jumlah_medali_mkw + jumlah_medali_kbp) as "Total Medals",
        created_at as "Created At",
        updated_at as "Updated At"
      FROM certificates
      ORDER BY created_at DESC
    `);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Certificates");

    worksheet.columns = [
      { header: "Batch ID", key: "Batch ID", width: 15 },
      { header: "SND Certificates", key: "SND Certificates", width: 18 },
      { header: "SND Medals", key: "SND Medals", width: 15 },
      { header: "MKW Certificates", key: "MKW Certificates", width: 18 },
      { header: "MKW Medals", key: "MKW Medals", width: 15 },
      { header: "KBP Certificates", key: "KBP Certificates", width: 18 },
      { header: "KBP Medals", key: "KBP Medals", width: 15 },
      { header: "Total Certificates", key: "Total Certificates", width: 18 },
      { header: "Total Medals", key: "Total Medals", width: 15 },
      { header: "Created At", key: "Created At", width: 20 },
      { header: "Updated At", key: "Updated At", width: 20 },
    ];

    result.rows.forEach((row) => {
      worksheet.addRow(row);
    });

    formatHeader(worksheet);
    autoFitColumns(worksheet);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=certificates_${new Date().toISOString().split("T")[0]}.xlsx`,
    );

    await workbook.xlsx.write(res);
    logger.info("Certificates exported successfully");
    res.end();
  } catch (error) {
    logger.error("Export certificates error:", error);
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Failed to export certificates",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
  }
};

// =====================================================
// 2. EXPORT CERTIFICATE LOGS
// =====================================================
const exportCertificateLogs = async (req, res) => {
  try {
    logger.info("Exporting certificate logs to Excel");

    const result = await pool.query(`
      SELECT 
        certificate_id as "Certificate ID",
        action_type as "Action Type",
        description as "Description",
        from_branch as "From Branch",
        to_branch as "To Branch",
        certificate_amount as "Certificate Amount",
        medal_amount as "Medal Amount",
        performed_by as "Performed By",
        created_at as "Created At"
      FROM certificate_logs
      ORDER BY created_at DESC
    `);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Certificate Logs");

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

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=certificate_logs_${new Date().toISOString().split("T")[0]}.xlsx`,
    );

    await workbook.xlsx.write(res);
    logger.info("Certificate logs exported successfully");
    res.end();
  } catch (error) {
    logger.error("Export certificate logs error:", error);
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Failed to export certificate logs",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
  }
};

// =====================================================
// 3. EXPORT TEACHERS
// =====================================================
const exportTeachers = async (req, res) => {
  try {
    logger.info("Exporting teachers to Excel");

    const result = await pool.query(`
      SELECT 
        id as "ID",
        username as "Username",
        teacher_name as "Teacher Name",
        teacher_division as "Division",
        teacher_branch as "Branch",
        created_at as "Created At",
        updated_at as "Updated At"
      FROM users
      WHERE role = 'teacher'
      ORDER BY created_at DESC
    `);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Teachers");

    worksheet.columns = [
      { header: "ID", key: "ID", width: 8 },
      { header: "Username", key: "Username", width: 15 },
      { header: "Teacher Name", key: "Teacher Name", width: 25 },
      { header: "Division", key: "Division", width: 10 },
      { header: "Branch", key: "Branch", width: 10 },
      { header: "Created At", key: "Created At", width: 20 },
      { header: "Updated At", key: "Updated At", width: 20 },
    ];

    result.rows.forEach((row) => {
      worksheet.addRow(row);
    });

    formatHeader(worksheet);
    autoFitColumns(worksheet);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=teachers_${new Date().toISOString().split("T")[0]}.xlsx`,
    );

    await workbook.xlsx.write(res);
    logger.info("Teachers exported successfully");
    res.end();
  } catch (error) {
    logger.error("Export teachers error:", error);
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Failed to export teachers",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
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

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=modules_${new Date().toISOString().split("T")[0]}.xlsx`,
    );

    await workbook.xlsx.write(res);
    logger.info("Modules exported successfully");
    res.end();
  } catch (error) {
    logger.error("Export modules error:", error);
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Failed to export modules",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
  }
};

// =====================================================
// 5. EXPORT PRINTED CERTIFICATES
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

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=printed_certificates_${new Date().toISOString().split("T")[0]}.xlsx`,
    );

    await workbook.xlsx.write(res);
    logger.info("Printed certificates exported successfully");
    res.end();
  } catch (error) {
    logger.error("Export printed certificates error:", error);
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Failed to export printed certificates",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
  }
};

// =====================================================
// 6. EXPORT ALL DATA (MULTI-SHEET)
// =====================================================
const exportAllData = async (req, res) => {
  try {
    logger.info("Exporting all data to Excel (multi-sheet)");

    const workbook = new ExcelJS.Workbook();

    // Sheet 1: Stock Summary
    const summaryResult = await pool.query(`
      SELECT 
        'SND' as "Branch",
        COALESCE(SUM(jumlah_sertifikat_snd), 0) as "Certificates",
        COALESCE(SUM(jumlah_medali_snd), 0) as "Medals"
      FROM certificates
      UNION ALL
      SELECT 
        'MKW' as "Branch",
        COALESCE(SUM(jumlah_sertifikat_mkw), 0) as "Certificates",
        COALESCE(SUM(jumlah_medali_mkw), 0) as "Medals"
      FROM certificates
      UNION ALL
      SELECT 
        'KBP' as "Branch",
        COALESCE(SUM(jumlah_sertifikat_kbp), 0) as "Certificates",
        COALESCE(SUM(jumlah_medali_kbp), 0) as "Medals"
      FROM certificates
    `);

    const summarySheet = workbook.addWorksheet("Stock Summary");
    summarySheet.columns = [
      { header: "Branch", key: "Branch", width: 12 },
      { header: "Certificates", key: "Certificates", width: 15 },
      { header: "Medals", key: "Medals", width: 15 },
    ];
    summaryResult.rows.forEach((row) => summarySheet.addRow(row));
    formatHeader(summarySheet);

    // Sheet 2: Certificates
    const certificatesResult = await pool.query(`
      SELECT 
        certificate_id as "Batch ID",
        jumlah_sertifikat_snd as "SND Certificates",
        jumlah_medali_snd as "SND Medals",
        jumlah_sertifikat_mkw as "MKW Certificates",
        jumlah_medali_mkw as "MKW Medals",
        jumlah_sertifikat_kbp as "KBP Certificates",
        jumlah_medali_kbp as "KBP Medals",
        created_at as "Created At"
      FROM certificates
      ORDER BY created_at DESC
    `);

    const certSheet = workbook.addWorksheet("Certificates");
    certSheet.columns = [
      { header: "Batch ID", key: "Batch ID", width: 15 },
      { header: "SND Certificates", key: "SND Certificates", width: 18 },
      { header: "SND Medals", key: "SND Medals", width: 15 },
      { header: "MKW Certificates", key: "MKW Certificates", width: 18 },
      { header: "MKW Medals", key: "MKW Medals", width: 15 },
      { header: "KBP Certificates", key: "KBP Certificates", width: 18 },
      { header: "KBP Medals", key: "KBP Medals", width: 15 },
      { header: "Created At", key: "Created At", width: 20 },
    ];
    certificatesResult.rows.forEach((row) => certSheet.addRow(row));
    formatHeader(certSheet);

    // Sheet 3: Teachers
    const teachersResult = await pool.query(`
      SELECT 
        username as "Username",
        teacher_name as "Teacher Name",
        teacher_division as "Division",
        teacher_branch as "Branch",
        created_at as "Created At"
      FROM users
      WHERE role = 'teacher'
      ORDER BY teacher_branch, teacher_name
    `);

    const teacherSheet = workbook.addWorksheet("Teachers");
    teacherSheet.columns = [
      { header: "Username", key: "Username", width: 15 },
      { header: "Teacher Name", key: "Teacher Name", width: 25 },
      { header: "Division", key: "Division", width: 10 },
      { header: "Branch", key: "Branch", width: 10 },
      { header: "Created At", key: "Created At", width: 20 },
    ];
    teachersResult.rows.forEach((row) => teacherSheet.addRow(row));
    formatHeader(teacherSheet);

    // Sheet 4: Modules
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

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=certificate_system_export_${new Date().toISOString().split("T")[0]}.xlsx`,
    );

    await workbook.xlsx.write(res);
    logger.info("All data exported successfully");
    res.end();
  } catch (error) {
    logger.error("Export all data error:", error);
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Failed to export all data",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
  }
};

module.exports = {
  exportCertificates,
  exportCertificateLogs,
  exportTeachers,
  exportModules,
  exportPrintedCertificates,
  exportAllData,
};
