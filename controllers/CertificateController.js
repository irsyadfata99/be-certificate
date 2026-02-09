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
    await client.query(
      `SET LOCAL statement_timeout = '${CONSTANTS.TRANSACTION.TIMEOUT}'`,
    );

    const { certificate_id, jumlah_sertifikat, jumlah_medali } = req.body;

    logger.info("Create certificate request:", {
      certificate_id,
      jumlah_sertifikat,
      jumlah_medali,
    });

    // Validation
    if (!certificate_id || !certificate_id.trim()) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "Certificate ID is required",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    const cleanId = validators.sanitizeString(certificate_id.trim());

    // Validate certificate ID
    const idValidation = validators.validateCertificateId(cleanId);
    if (!idValidation.valid) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        idValidation.error,
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    // Validate amounts
    const certAmount = parseInt(jumlah_sertifikat) || 0;
    const medalAmount = parseInt(jumlah_medali) || 0;

    if (certAmount < 0 || medalAmount < 0) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "Certificate and medal amounts cannot be negative",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    if (certAmount === 0 && medalAmount === 0) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "At least one certificate or medal must be greater than 0",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    // Check if certificate ID already exists
    const existingCert = await client.query(
      "SELECT certificate_id FROM certificates WHERE certificate_id = $1",
      [cleanId],
    );

    if (existingCert.rows.length > 0) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.CONFLICT,
        "Certificate batch ID already exists",
        CONSTANTS.ERROR_CODES.DUPLICATE_ENTRY,
      );
    }

    // 1. Insert into certificates table
    const certResult = await client.query(
      `INSERT INTO certificates (certificate_id) 
       VALUES ($1) 
       RETURNING *`,
      [cleanId],
    );

    // 2. Insert into certificate_stock (SND only - central branch)
    await client.query(
      `INSERT INTO certificate_stock 
       (certificate_id, branch_code, jumlah_sertifikat, jumlah_medali, medali_awal)
       VALUES ($1, 'SND', $2, $3, $3)`,
      [cleanId, certAmount, medalAmount],
    );

    // 3. Log the action
    await client.query(
      `INSERT INTO certificate_logs 
       (certificate_id, action_type, description, certificate_amount, medal_amount, 
        new_values, performed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        cleanId,
        CONSTANTS.LOG_ACTION_TYPES.CREATE,
        `Created certificate batch for SND: ${certAmount} certificates, ${medalAmount} medals`,
        certAmount,
        medalAmount,
        JSON.stringify({
          branch: "SND",
          certificates: certAmount,
          medals: medalAmount,
        }),
        req.user?.username || "System",
      ],
    );

    await client.query("COMMIT");

    logger.info(`Certificate batch created successfully: ${cleanId}`);

    return sendSuccess(
      res,
      "Certificate batch created successfully",
      certResult.rows[0],
    );
  } catch (error) {
    await client.query("ROLLBACK");

    // Handle specific PostgreSQL errors
    if (error.code === "23505") {
      // Unique violation
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.CONFLICT,
        "Certificate batch ID already exists",
        CONSTANTS.ERROR_CODES.DUPLICATE_ENTRY,
        error,
      );
    }

    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Failed to create certificate",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
  } finally {
    client.release();
  }
};

// =====================================================
// 2. GET ALL CERTIFICATES (SERVER-SIDE PAGINATION) - FIXED
// =====================================================
const getAllCertificates = async (req, res) => {
  try {
    // Parse query parameters with defaults
    const {
      limit: limitParam = CONSTANTS.PAGINATION.DEFAULT_LIMIT,
      offset: offsetParam = CONSTANTS.PAGINATION.DEFAULT_OFFSET,
      search = "",
    } = req.query;

    logger.info("Get all certificates request:", req.query);

    // Validate and sanitize pagination parameters
    const limit = Math.min(
      Math.max(parseInt(limitParam) || CONSTANTS.PAGINATION.DEFAULT_LIMIT, 1),
      CONSTANTS.PAGINATION.MAX_LIMIT,
    );
    const offset = Math.max(
      parseInt(offsetParam) || CONSTANTS.PAGINATION.DEFAULT_OFFSET,
      0,
    );

    // Build query with search filter
    let whereClause = "";
    const queryParams = [limit, offset];
    let paramCount = 3;

    if (search && search.trim()) {
      whereClause = `WHERE c.certificate_id ILIKE $${paramCount}`;
      queryParams.push(`%${search.trim()}%`);
      paramCount++;
    }

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
      ${whereClause}
      GROUP BY c.id, c.certificate_id, c.created_at, c.updated_at
      ORDER BY c.created_at DESC
      LIMIT $1 OFFSET $2
    `;

    logger.debug("Query:", query);
    logger.debug("Params:", queryParams);

    const result = await pool.query(query, queryParams);

    // Get total count for pagination
    let countQuery = "SELECT COUNT(*) FROM certificates c";
    const countParams = [];

    if (search && search.trim()) {
      countQuery += " WHERE c.certificate_id ILIKE $1";
      countParams.push(`%${search.trim()}%`);
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    logger.info(
      `Certificates retrieved: ${result.rows.length}/${totalCount} records`,
    );

    return sendSuccess(
      res,
      "Certificates retrieved successfully",
      result.rows,
      {
        pagination: {
          total: totalCount,
          limit: limit,
          offset: offset,
          hasMore: totalCount > offset + result.rows.length,
          currentPage: Math.floor(offset / limit) + 1,
          totalPages: Math.ceil(totalCount / limit),
        },
      },
    );
  } catch (error) {
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Failed to fetch certificates",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
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
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        idValidation.error,
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    const cleanId = idValidation.value;

    const query = `
      SELECT 
        c.id,
        c.certificate_id,
        c.created_at,
        c.updated_at,
        
        -- Stock by branch
        COALESCE(
          json_agg(
            json_build_object(
              'branch_code', cs.branch_code,
              'branch_name', b.branch_name,
              'certificates', cs.jumlah_sertifikat,
              'medals', cs.jumlah_medali,
              'initial_medals', cs.medali_awal
            ) ORDER BY cs.branch_code
          ) FILTER (WHERE cs.branch_code IS NOT NULL),
          '[]'::json
        ) as stock_by_branch,
        
        -- Totals
        COALESCE(SUM(cs.jumlah_sertifikat), 0) as total_certificates,
        COALESCE(SUM(cs.jumlah_medali), 0) as total_medals
        
      FROM certificates c
      LEFT JOIN certificate_stock cs ON c.certificate_id = cs.certificate_id
      LEFT JOIN branches b ON cs.branch_code = b.branch_code
      WHERE c.certificate_id = $1
      GROUP BY c.id, c.certificate_id, c.created_at, c.updated_at
    `;

    const result = await pool.query(query, [cleanId]);

    if (result.rows.length === 0) {
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.NOT_FOUND,
        "Certificate not found",
        CONSTANTS.ERROR_CODES.NOT_FOUND,
      );
    }

    return sendSuccess(
      res,
      "Certificate retrieved successfully",
      result.rows[0],
    );
  } catch (error) {
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Failed to retrieve certificate",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
  }
};

// =====================================================
// 4. CLEAR ALL CERTIFICATES
// =====================================================
const clearAllCertificates = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `SET LOCAL statement_timeout = '${CONSTANTS.TRANSACTION.TIMEOUT}'`,
    );

    logger.info("Clear all certificates requested");

    // Get all certificates with their stock
    const allCertsResult = await client.query(`
      SELECT 
        c.certificate_id,
        COALESCE(SUM(cs.jumlah_sertifikat), 0) as total_cert,
        COALESCE(SUM(cs.jumlah_medali), 0) as total_medal
      FROM certificates c
      LEFT JOIN certificate_stock cs ON c.certificate_id = cs.certificate_id
      GROUP BY c.certificate_id
    `);

    const allCertificates = allCertsResult.rows;

    if (allCertificates.length === 0) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "No certificates to delete",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    logger.info(`Found ${allCertificates.length} certificates to delete`);

    let totalCert = 0;
    let totalMedal = 0;

    allCertificates.forEach((cert) => {
      totalCert += parseInt(cert.total_cert) || 0;
      totalMedal += parseInt(cert.total_medal) || 0;
    });

    // Delete all certificates (cascade will delete stock)
    const deleteResult = await client.query(
      "DELETE FROM certificates RETURNING *",
    );

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

    return sendSuccess(
      res,
      `Successfully deleted all ${allCertificates.length} certificate batches`,
      {
        deleted_count: allCertificates.length,
        total_certificates_deleted: totalCert,
        total_medals_deleted: totalMedal,
      },
    );
  } catch (error) {
    await client.query("ROLLBACK");
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Failed to clear certificates",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
  } finally {
    client.release();
  }
};

// =====================================================
// 5. MIGRATE CERTIFICATE - FIXED
// =====================================================
const migrateCertificate = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `SET LOCAL statement_timeout = '${CONSTANTS.TRANSACTION.TIMEOUT}'`,
    );

    const {
      certificate_id,
      destination_branch,
      certificate_amount,
      medal_amount,
    } = req.body;

    logger.info("Migrate certificate request:", {
      certificate_id,
      destination_branch,
      certificate_amount,
      medal_amount,
    });

    // Validation
    if (!certificate_id || !certificate_id.trim()) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "Certificate ID is required",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    if (!destination_branch || !destination_branch.trim()) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "Destination branch is required",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    const cleanId = validators.sanitizeString(certificate_id.trim());
    const cleanDestination = validators.sanitizeString(
      destination_branch.trim().toUpperCase(),
    );

    // Validate amounts
    const certAmount = parseInt(certificate_amount) || 0;
    const medalAmount = parseInt(medal_amount) || 0;

    if (certAmount < 0 || medalAmount < 0) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "Certificate and medal amounts cannot be negative",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    if (certAmount === 0 && medalAmount === 0) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "At least one certificate or medal amount must be greater than 0",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    // Check if certificate exists
    const certCheck = await client.query(
      "SELECT certificate_id FROM certificates WHERE certificate_id = $1",
      [cleanId],
    );

    if (certCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.NOT_FOUND,
        "Certificate batch not found",
        CONSTANTS.ERROR_CODES.NOT_FOUND,
      );
    }

    // Check if destination branch exists
    const branchCheck = await client.query(
      "SELECT branch_code, branch_name FROM branches WHERE branch_code = $1 AND is_active = true",
      [cleanDestination],
    );

    if (branchCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.NOT_FOUND,
        "Destination branch not found or inactive",
        CONSTANTS.ERROR_CODES.NOT_FOUND,
      );
    }

    // Cannot migrate to SND (central branch)
    if (cleanDestination === "SND") {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "Cannot migrate to central branch (SND). Use this only for migrating FROM SND to other branches.",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    // Check SND stock availability
    const sndStockCheck = await client.query(
      "SELECT jumlah_sertifikat, jumlah_medali FROM certificate_stock WHERE certificate_id = $1 AND branch_code = 'SND'",
      [cleanId],
    );

    if (sndStockCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.NOT_FOUND,
        "No stock available at central branch (SND) for this certificate batch",
        CONSTANTS.ERROR_CODES.NOT_FOUND,
      );
    }

    const sndStock = sndStockCheck.rows[0];
    const availableCerts = parseInt(sndStock.jumlah_sertifikat) || 0;
    const availableMedals = parseInt(sndStock.jumlah_medali) || 0;

    // Validate sufficient stock
    if (certAmount > availableCerts) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        `Insufficient certificates at SND. Available: ${availableCerts}, Requested: ${certAmount}`,
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    if (medalAmount > availableMedals) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        `Insufficient medals at SND. Available: ${availableMedals}, Requested: ${medalAmount}`,
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    // Deduct from SND
    await client.query(
      `UPDATE certificate_stock 
       SET jumlah_sertifikat = jumlah_sertifikat - $1,
           jumlah_medali = jumlah_medali - $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE certificate_id = $3 AND branch_code = 'SND'`,
      [certAmount, medalAmount, cleanId],
    );

    // Add to destination (INSERT or UPDATE)
    await client.query(
      `INSERT INTO certificate_stock 
       (certificate_id, branch_code, jumlah_sertifikat, jumlah_medali, medali_awal)
       VALUES ($1, $2, $3, $4, $4)
       ON CONFLICT (certificate_id, branch_code) 
       DO UPDATE SET 
         jumlah_sertifikat = certificate_stock.jumlah_sertifikat + $3,
         jumlah_medali = certificate_stock.jumlah_medali + $4,
         updated_at = CURRENT_TIMESTAMP`,
      [cleanId, cleanDestination, certAmount, medalAmount],
    );

    // Log the migration
    await client.query(
      `INSERT INTO certificate_logs 
       (certificate_id, action_type, description, from_branch, to_branch,
        certificate_amount, medal_amount, performed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        cleanId,
        CONSTANTS.LOG_ACTION_TYPES.MIGRATE,
        `Migrated ${certAmount} certificates and ${medalAmount} medals from SND to ${branchCheck.rows[0].branch_name} (${cleanDestination})`,
        "SND",
        cleanDestination,
        certAmount,
        medalAmount,
        req.user?.username || "System",
      ],
    );

    await client.query("COMMIT");

    logger.info(
      `Migration successful: ${cleanId} from SND to ${cleanDestination}`,
    );

    return sendSuccess(res, "Stock migrated successfully", {
      certificate_id: cleanId,
      from_branch: "SND",
      to_branch: cleanDestination,
      certificates_migrated: certAmount,
      medals_migrated: medalAmount,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Migration failed",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
  } finally {
    client.release();
  }
};

// =====================================================
// 6. GET STOCK SUMMARY - FIXED FOR DYNAMIC BRANCHES
// =====================================================
const getStockSummary = async (req, res) => {
  try {
    logger.info("Fetching stock summary...");

    const summaryQuery = `
      SELECT 
        cs.branch_code,
        b.branch_name,
        COALESCE(SUM(cs.jumlah_sertifikat), 0) as total_certificates,
        COALESCE(SUM(cs.jumlah_medali), 0) as total_medals
      FROM certificate_stock cs
      JOIN branches b ON cs.branch_code = b.branch_code
      GROUP BY cs.branch_code, b.branch_name
      ORDER BY cs.branch_code
    `;

    const summaryResult = await pool.query(summaryQuery);

    // Calculate grand totals
    let grandTotalCertificates = 0;
    let grandTotalMedals = 0;

    const stockByBranch = {};

    summaryResult.rows.forEach((row) => {
      const certs = parseInt(row.total_certificates) || 0;
      const medals = parseInt(row.total_medals) || 0;

      stockByBranch[row.branch_code] = {
        branch_name: row.branch_name,
        certificates: certs,
        medals: medals,
      };

      grandTotalCertificates += certs;
      grandTotalMedals += medals;
    });

    const data = {
      stock_by_branch: stockByBranch,
      grand_total: {
        certificates: grandTotalCertificates,
        medals: grandTotalMedals,
      },
    };

    logger.info("Stock summary generated successfully");

    return sendSuccess(res, "Stock summary retrieved successfully", data, {
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Failed to retrieve stock summary",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
  }
};

// =====================================================
// 7. GET TRANSACTION HISTORY
// =====================================================
const getTransactionHistory = async (req, res) => {
  try {
    const {
      limit: limitParam = CONSTANTS.PAGINATION.HISTORY_DEFAULT_LIMIT,
      offset: offsetParam = CONSTANTS.PAGINATION.DEFAULT_OFFSET,
      from_date: fromDate,
      to_date: toDate,
    } = req.query;

    logger.info("Fetching transaction history:", req.query);

    const validatedLimit = Math.min(
      Math.max(
        parseInt(limitParam) || CONSTANTS.PAGINATION.HISTORY_DEFAULT_LIMIT,
        1,
      ),
      CONSTANTS.PAGINATION.MAX_LIMIT,
    );
    const validatedOffset = Math.max(
      parseInt(offsetParam) || CONSTANTS.PAGINATION.DEFAULT_OFFSET,
      0,
    );

    let query = `
      SELECT 
        c.certificate_id,
        c.created_at,
        c.updated_at,
        
        -- Stock by branch
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
        ) as stock_by_branch
        
      FROM certificates c
      LEFT JOIN certificate_stock cs ON c.certificate_id = cs.certificate_id
      LEFT JOIN branches b ON cs.branch_code = b.branch_code
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 1;

    if (fromDate && fromDate.trim()) {
      query += ` AND c.created_at >= $${paramCount}`;
      params.push(fromDate.trim());
      paramCount++;
    }

    if (toDate && toDate.trim()) {
      query += ` AND c.created_at < $${paramCount}::date + interval '1 day'`;
      params.push(toDate.trim());
      paramCount++;
    }

    query += ` GROUP BY c.certificate_id, c.created_at, c.updated_at`;
    query += ` ORDER BY c.created_at DESC`;
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

    logger.info(
      `Transaction history retrieved: ${result.rows.length}/${totalCount} records`,
    );

    return sendSuccess(
      res,
      "Transaction history retrieved successfully",
      result.rows,
      {
        pagination: {
          total: totalCount,
          limit: validatedLimit,
          offset: validatedOffset,
          hasMore: totalCount > validatedOffset + result.rows.length,
          currentPage: Math.floor(validatedOffset / validatedLimit) + 1,
          totalPages: Math.ceil(totalCount / validatedLimit),
        },
      },
    );
  } catch (error) {
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Failed to retrieve transaction history",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
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
