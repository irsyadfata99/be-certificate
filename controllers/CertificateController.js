// controllers/CertificateController.js - FIXED VERSION
const pool = require("../config/database");
const { logAction } = require("./CertificateLogsController");
const logger = require("../utils/logger");
const CONSTANTS = require("../utils/constants");
const validators = require("../utils/validators");
const { sendError, sendSuccess } = require("../utils/responseHelper");

// =====================================================
// 1. CREATE NEW CERTIFICATE
// =====================================================
const createCertificate = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { certificate_id, jumlah_sertifikat, jumlah_medali } = req.body;

    // 1. Insert ke certificates table
    const certResult = await client.query(
      `INSERT INTO certificates (certificate_id) 
       VALUES ($1) RETURNING *`,
      [certificate_id],
    );

    // 2. Insert ke certificate_stock (SND only - as per requirement)
    await client.query(
      `INSERT INTO certificate_stock 
       (certificate_id, branch_code, jumlah_sertifikat, jumlah_medali, medali_awal)
       VALUES ($1, 'SND', $2, $3, $3)`,
      [certificate_id, jumlah_sertifikat, jumlah_medali],
    );

    await client.query("COMMIT");

    // Return with stock data
    return sendSuccess(res, "Certificate created", certResult.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    return sendError(res, 500, "Failed to create certificate", error);
  } finally {
    client.release();
  }
};

// =====================================================
// 2. GET ALL CERTIFICATES (SERVER-SIDE PAGINATION)
// =====================================================
// ✅ BENAR - JOIN untuk dynamic branches
const getAllCertificates = async (req, res) => {
  try {
    const query = `
      SELECT 
        c.id,
        c.certificate_id,
        c.created_at,
        c.updated_at,
        
        -- Stock by branch (dynamic JSON aggregation)
        COALESCE(
          json_agg(
            json_build_object(
              'branch_code', cs.branch_code,
              'branch_name', b.branch_name,
              'certificates', cs.jumlah_sertifikat,
              'medals', cs.jumlah_medali
            ) ORDER BY cs.branch_code
          ) FILTER (WHERE cs.branch_code IS NOT NULL),
          '[]'::json
        ) as stock_by_branch,
        
        -- Total per batch
        COALESCE(SUM(cs.jumlah_sertifikat), 0) as batch_total_cert,
        COALESCE(SUM(cs.jumlah_medali), 0) as batch_total_medal
        
      FROM certificates c
      LEFT JOIN certificate_stock cs ON c.certificate_id = cs.certificate_id
      LEFT JOIN branches b ON cs.branch_code = b.branch_code
      GROUP BY c.id, c.certificate_id, c.created_at, c.updated_at
      ORDER BY c.created_at DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await pool.query(query, [limit, offset]);

    return sendSuccess(res, "Certificates retrieved", result.rows);
  } catch (error) {
    return sendError(res, 500, "Failed to fetch certificates", error);
  }
};
// =====================================================
// 3. GET CERTIFICATE BY ID
// =====================================================
const getCertificateById = async (req, res) => {
  try {
    const { id } = req.params;

    const idValidation = validators.validateCertificateId(id);
    if (!idValidation.valid) {
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, idValidation.error, CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    const cleanId = idValidation.value;

    const result = await pool.query("SELECT * FROM certificates WHERE certificate_id = $1", [cleanId]);

    if (result.rows.length === 0) {
      return sendError(res, CONSTANTS.HTTP_STATUS.NOT_FOUND, "Certificate not found", CONSTANTS.ERROR_CODES.NOT_FOUND);
    }

    return sendSuccess(res, "Certificate retrieved successfully", result.rows[0]);
  } catch (error) {
    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to retrieve certificate", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  }
};

// =====================================================
// 4. CLEAR ALL CERTIFICATES
// =====================================================
const clearAllCertificates = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL statement_timeout = '${CONSTANTS.TRANSACTION.TIMEOUT}'`);

    logger.info("Clear all certificates requested");

    const allCertsResult = await client.query("SELECT * FROM certificates");
    const allCertificates = allCertsResult.rows;

    if (allCertificates.length === 0) {
      await client.query("ROLLBACK");
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "No certificates to delete", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    logger.info(`Found ${allCertificates.length} certificates to delete`);

    let totalCert = 0;
    let totalMedal = 0;

    allCertificates.forEach((cert) => {
      totalCert += (cert.jumlah_sertifikat_snd || 0) + (cert.jumlah_sertifikat_mkw || 0) + (cert.jumlah_sertifikat_kbp || 0);
      totalMedal += (cert.jumlah_medali_snd || 0) + (cert.jumlah_medali_mkw || 0) + (cert.jumlah_medali_kbp || 0);
    });

    const deleteResult = await client.query("DELETE FROM certificates RETURNING *");

    logger.info(`Deleted ${deleteResult.rows.length} certificates`);

    // Log action
    await client.query(
      `INSERT INTO certificate_logs 
       (certificate_id, action_type, description, certificate_amount, medal_amount, 
        old_values, performed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        "BULK_DELETE",
        CONSTANTS.LOG_ACTION_TYPES.DELETE_ALL,
        `Cleared all ${allCertificates.length} certificate batches. Total: ${totalCert} certificates, ${totalMedal} medals deleted`,
        totalCert,
        totalMedal,
        JSON.stringify({
          batches_deleted: allCertificates.length,
          total_certificates: totalCert,
          total_medals: totalMedal,
          deleted_at: new Date().toISOString(),
        }),
        req.user?.username || "System",
      ],
    );

    await client.query("COMMIT");

    return sendSuccess(res, `Successfully deleted all ${allCertificates.length} certificate batches`, {
      deleted_count: allCertificates.length,
      total_certificates_deleted: totalCert,
      total_medals_deleted: totalMedal,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to clear certificates", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  } finally {
    client.release();
  }
};

// =====================================================
// 5. MIGRATE CERTIFICATE
// =====================================================
// ✅ BENAR - Migrate using certificate_stock
const migrateCertificate = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { certificate_id, destination_branch, certificate_amount, medal_amount } = req.body;

    // Deduct from SND
    await client.query(
      `UPDATE certificate_stock 
       SET jumlah_sertifikat = jumlah_sertifikat - $1,
           jumlah_medali = jumlah_medali - $2
       WHERE certificate_id = $3 AND branch_code = 'SND'`,
      [certificate_amount, medal_amount, certificate_id],
    );

    // Add to destination (INSERT or UPDATE)
    await client.query(
      `INSERT INTO certificate_stock 
       (certificate_id, branch_code, jumlah_sertifikat, jumlah_medali, medali_awal)
       VALUES ($1, $2, $3, $4, $4)
       ON CONFLICT (certificate_id, branch_code) 
       DO UPDATE SET 
         jumlah_sertifikat = certificate_stock.jumlah_sertifikat + $3,
         jumlah_medali = certificate_stock.jumlah_medali + $4`,
      [certificate_id, destination_branch, certificate_amount, medal_amount],
    );

    await client.query("COMMIT");

    return sendSuccess(res, "Migration successful");
  } catch (error) {
    await client.query("ROLLBACK");
    return sendError(res, 500, "Migration failed", error);
  } finally {
    client.release();
  }
};

// =====================================================
// 6. GET STOCK SUMMARY
// =====================================================
const getStockSummary = async (req, res) => {
  try {
    logger.info("Fetching stock summary...");

    const summaryQuery = await pool.query(`
      SELECT 
        COALESCE(SUM(jumlah_sertifikat_snd), 0) as snd_cert,
        COALESCE(SUM(jumlah_medali_snd), 0) as snd_medal,
        COALESCE(SUM(jumlah_sertifikat_mkw), 0) as mkw_cert,
        COALESCE(SUM(jumlah_medali_mkw), 0) as mkw_medal,
        COALESCE(SUM(jumlah_sertifikat_kbp), 0) as kbp_cert,
        COALESCE(SUM(jumlah_medali_kbp), 0) as kbp_medal
      FROM certificates
    `);

    const summary = summaryQuery.rows[0] || {};

    const data = {
      total_stock: {
        snd: {
          certificates: parseInt(summary.snd_cert) || 0,
          medals: parseInt(summary.snd_medal) || 0,
        },
        mkw: {
          certificates: parseInt(summary.mkw_cert) || 0,
          medals: parseInt(summary.mkw_medal) || 0,
        },
        kbp: {
          certificates: parseInt(summary.kbp_cert) || 0,
          medals: parseInt(summary.kbp_medal) || 0,
        },
      },
      grand_total: {
        certificates: (parseInt(summary.snd_cert) || 0) + (parseInt(summary.mkw_cert) || 0) + (parseInt(summary.kbp_cert) || 0),
        medals: (parseInt(summary.snd_medal) || 0) + (parseInt(summary.mkw_medal) || 0) + (parseInt(summary.kbp_medal) || 0),
      },
    };

    logger.info("Stock summary generated successfully");

    return sendSuccess(res, "Stock summary retrieved successfully", data, {
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to retrieve stock summary", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  }
};

// =====================================================
// 7. GET TRANSACTION HISTORY
// =====================================================
const getTransactionHistory = async (req, res) => {
  try {
    const { limit: limitParam = CONSTANTS.PAGINATION.HISTORY_DEFAULT_LIMIT, offset: offsetParam = CONSTANTS.PAGINATION.DEFAULT_OFFSET, from_date: fromDate, to_date: toDate } = req.query;

    logger.info("Fetching transaction history:", req.query);

    const validatedLimit = Math.min(Math.max(parseInt(limitParam) || CONSTANTS.PAGINATION.HISTORY_DEFAULT_LIMIT, 1), CONSTANTS.PAGINATION.MAX_LIMIT);
    const validatedOffset = Math.max(parseInt(offsetParam) || CONSTANTS.PAGINATION.DEFAULT_OFFSET, 0);

    let query = `
      SELECT 
        certificate_id,
        jumlah_sertifikat_snd, jumlah_medali_snd,
        jumlah_sertifikat_mkw, jumlah_medali_mkw,
        jumlah_sertifikat_kbp, jumlah_medali_kbp,
        created_at,
        updated_at
      FROM certificates 
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 1;

    if (fromDate && fromDate.trim()) {
      query += ` AND created_at >= $${paramCount}`;
      params.push(fromDate.trim());
      paramCount++;
    }

    if (toDate && toDate.trim()) {
      query += ` AND created_at < $${paramCount}::date + interval '1 day'`;
      params.push(toDate.trim());
      paramCount++;
    }

    query += ` ORDER BY created_at DESC`;
    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(validatedLimit, validatedOffset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = "SELECT COUNT(*) FROM certificates WHERE 1=1";
    const countParams = [];
    let countParamNum = 1;

    if (fromDate && fromDate.trim()) {
      countQuery += ` AND created_at >= $${countParamNum}`;
      countParams.push(fromDate.trim());
      countParamNum++;
    }

    if (toDate && toDate.trim()) {
      countQuery += ` AND created_at < $${countParamNum}::date + interval '1 day'`;
      countParams.push(toDate.trim());
      countParamNum++;
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    logger.info(`Transaction history retrieved: ${result.rows.length}/${totalCount} records`);

    return sendSuccess(res, "Transaction history retrieved successfully", result.rows, {
      pagination: {
        total: totalCount,
        limit: validatedLimit,
        offset: validatedOffset,
        hasMore: totalCount > validatedOffset + result.rows.length,
        currentPage: Math.floor(validatedOffset / validatedLimit) + 1,
        totalPages: Math.ceil(totalCount / validatedLimit),
      },
    });
  } catch (error) {
    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to retrieve transaction history", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  }
};

module.exports = {
  createCertificate,
  getAllCertificates,
  getCertificateById,
  clearAllCertificates,
  migrateCertificate,
  getStockSummary,
  getTransactionHistory,
};
