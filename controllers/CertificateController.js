// controllers/CertificateController.js - FIXED VERSION
const pool = require("../config/database");
const { logAction } = require("./CertificateLogsController");
const logger = require("../utils/logger");
const CONSTANTS = require("../utils/constants");
const validators = require("../utils/validators");

// =====================================================
// STANDARDIZED ERROR RESPONSE HELPER
// =====================================================
function sendError(res, statusCode, message, errorCode = null, error = null) {
  const response = {
    success: false,
    message: message,
    errorCode: errorCode,
  };

  if (error && process.env.NODE_ENV === "development") {
    response.error = error.message;
    response.stack = error.stack;
  }

  logger.error(`Error (${statusCode}): ${message}`, error || "");
  return res.status(statusCode).json(response);
}

function sendSuccess(res, message, data = null, meta = null) {
  const response = {
    success: true,
    message: message,
  };

  if (data !== null) response.data = data;
  if (meta !== null) response.meta = meta;

  return res.json(response);
}

// =====================================================
// 1. CREATE NEW CERTIFICATE
// =====================================================
const createCertificate = async (req, res) => {
  try {
    logger.info("Create certificate request:", req.body);

    const {
      certificate_id: certificateId,
      jumlah_sertifikat_kbp: jumlahSertifikatKbp,
      jumlah_medali_kbp: jumlahMedaliKbp,
      jumlah_sertifikat_snd: jumlahSertifikatSnd,
      jumlah_medali_snd: jumlahMedaliSnd,
      jumlah_sertifikat_mkw: jumlahSertifikatMkw,
      jumlah_medali_mkw: jumlahMedaliMkw,
    } = req.body;

    // Validate certificate_id
    const idValidation = validators.validateCertificateId(certificateId);
    if (!idValidation.valid) {
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        idValidation.error,
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    const cleanId = idValidation.value;

    // Check if exists
    const checkExisting = await pool.query(
      "SELECT * FROM certificates WHERE certificate_id = $1",
      [cleanId],
    );

    if (checkExisting.rows.length > 0) {
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.CONFLICT,
        "Certificate ID already exists",
        CONSTANTS.ERROR_CODES.DUPLICATE_ENTRY,
      );
    }

    // Validate numeric inputs
    const validations = [
      {
        value: jumlahSertifikatKbp || 0,
        name: "KBP Certificates",
        key: "sertKbp",
      },
      {
        value: jumlahMedaliKbp || 0,
        name: "KBP Medals",
        key: "medalKbp",
      },
      {
        value: jumlahSertifikatSnd || 0,
        name: "SND Certificates",
        key: "sertSnd",
      },
      {
        value: jumlahMedaliSnd || 0,
        name: "SND Medals",
        key: "medalSnd",
      },
      {
        value: jumlahSertifikatMkw || 0,
        name: "MKW Certificates",
        key: "sertMkw",
      },
      {
        value: jumlahMedaliMkw || 0,
        name: "MKW Medals",
        key: "medalMkw",
      },
    ];

    const validated = {};
    for (const field of validations) {
      const result = validators.validatePositiveInteger(
        field.value,
        field.name,
      );
      if (!result.valid) {
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.BAD_REQUEST,
          result.error,
          CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
        );
      }
      validated[field.key] = result.value;
    }

    const sertKbp = validated.sertKbp;
    const medalKbp = validated.medalKbp;
    const sertSnd = validated.sertSnd;
    const medalSnd = validated.medalSnd;
    const sertMkw = validated.sertMkw;
    const medalMkw = validated.medalMkw;

    // At least one must be > 0
    const totalInput =
      sertKbp + medalKbp + sertSnd + medalSnd + sertMkw + medalMkw;

    if (totalInput === 0) {
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "At least one certificate or medal must be greater than 0 for any branch",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    // Insert
    const result = await pool.query(
      `INSERT INTO certificates 
       (certificate_id, 
        jumlah_sertifikat_kbp, jumlah_medali_kbp, medali_awal_kbp,
        jumlah_sertifikat_snd, jumlah_medali_snd, medali_awal_snd,
        jumlah_sertifikat_mkw, jumlah_medali_mkw, medali_awal_mkw) 
       VALUES ($1, $2, $3, $3, $4, $5, $5, $6, $7, $7) 
       RETURNING *`,
      [cleanId, sertKbp, medalKbp, sertSnd, medalSnd, sertMkw, medalMkw],
    );

    logger.info("Certificate created:", result.rows[0]);

    // Log action
    await logAction({
      certificateId: cleanId,
      actionType: CONSTANTS.LOG_ACTION_TYPES.CREATE,
      description: `Created new certificate batch: SND: ${sertSnd} certs, ${medalSnd} medals | MKW: ${sertMkw} certs, ${medalMkw} medals | KBP: ${sertKbp} certs, ${medalKbp} medals`,
      newValues: result.rows[0],
      performedBy: req.user?.username || "System",
    });

    return sendSuccess(res, "Certificate created successfully", result.rows[0]);
  } catch (error) {
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Failed to create certificate",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
  }
};

// =====================================================
// 2. GET ALL CERTIFICATES (SERVER-SIDE PAGINATION)
// =====================================================
const getAllCertificates = async (req, res) => {
  try {
    const {
      limit: limitParam = CONSTANTS.PAGINATION.CERTIFICATES_DEFAULT_LIMIT,
      offset: offsetParam = CONSTANTS.PAGINATION.DEFAULT_OFFSET,
    } = req.query;

    // Validate pagination params
    const validatedLimit = Math.min(
      Math.max(
        parseInt(limitParam) || CONSTANTS.PAGINATION.CERTIFICATES_DEFAULT_LIMIT,
        1,
      ),
      CONSTANTS.PAGINATION.MAX_LIMIT,
    );
    const validatedOffset = Math.max(
      parseInt(offsetParam) || CONSTANTS.PAGINATION.DEFAULT_OFFSET,
      0,
    );

    logger.info(
      `Get certificates: limit=${validatedLimit}, offset=${validatedOffset}`,
    );

    // Get paginated results WITH cumulative totals
    const query = `
      WITH batch_totals AS (
        SELECT 
          *,
          (COALESCE(jumlah_sertifikat_snd, 0) + COALESCE(jumlah_sertifikat_mkw, 0) + COALESCE(jumlah_sertifikat_kbp, 0)) as batch_total_cert,
          (COALESCE(jumlah_medali_snd, 0) + COALESCE(jumlah_medali_mkw, 0) + COALESCE(jumlah_medali_kbp, 0)) as batch_total_medal
        FROM certificates
      ),
      cumulative_totals AS (
        SELECT 
          *,
          SUM(batch_total_cert) OVER (ORDER BY created_at, id) as cumulative_total_cert,
          SUM(batch_total_medal) OVER (ORDER BY created_at, id) as cumulative_total_medal
        FROM batch_totals
      )
      SELECT * FROM cumulative_totals
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await pool.query(query, [validatedLimit, validatedOffset]);

    // Get total count
    const countResult = await pool.query("SELECT COUNT(*) FROM certificates");
    const totalCount = parseInt(countResult.rows[0].count);

    const pagination = {
      total: totalCount,
      limit: validatedLimit,
      offset: validatedOffset,
      hasMore: totalCount > validatedOffset + result.rows.length,
      currentPage: Math.floor(validatedOffset / validatedLimit) + 1,
      totalPages: Math.ceil(totalCount / validatedLimit),
    };

    logger.info(`Returned ${result.rows.length}/${totalCount} certificates`);

    return sendSuccess(
      res,
      "Certificates retrieved successfully",
      result.rows,
      { pagination, count: result.rows.length },
    );
  } catch (error) {
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Failed to retrieve certificates",
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

    const result = await pool.query(
      "SELECT * FROM certificates WHERE certificate_id = $1",
      [cleanId],
    );

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
// 4. UPDATE CERTIFICATE (DISABLED)
// =====================================================
const updateCertificate = async (req, res) => {
  return sendError(
    res,
    CONSTANTS.HTTP_STATUS.FORBIDDEN,
    "Update operation is not allowed. Please create a new batch for adjustments or use migration feature.",
    CONSTANTS.ERROR_CODES.FORBIDDEN,
  );
};

// =====================================================
// 5. DELETE CERTIFICATE (DISABLED)
// =====================================================
const deleteCertificate = async (req, res) => {
  return sendError(
    res,
    CONSTANTS.HTTP_STATUS.FORBIDDEN,
    "Delete operation is not allowed. Batches are permanent records for audit purposes.",
    CONSTANTS.ERROR_CODES.FORBIDDEN,
  );
};

// =====================================================
// 6. CLEAR ALL CERTIFICATES
// =====================================================
const clearAllCertificates = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `SET LOCAL statement_timeout = '${CONSTANTS.TRANSACTION.TIMEOUT}'`,
    );

    logger.info("Clear all certificates requested");

    const allCertsResult = await client.query("SELECT * FROM certificates");
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
      totalCert +=
        (cert.jumlah_sertifikat_snd || 0) +
        (cert.jumlah_sertifikat_mkw || 0) +
        (cert.jumlah_sertifikat_kbp || 0);
      totalMedal +=
        (cert.jumlah_medali_snd || 0) +
        (cert.jumlah_medali_mkw || 0) +
        (cert.jumlah_medali_kbp || 0);
    });

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
// 7. MIGRATE CERTIFICATE
// =====================================================
const migrateCertificate = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `SET LOCAL statement_timeout = '${CONSTANTS.TRANSACTION.TIMEOUT}'`,
    );

    logger.info("Migrate request:", req.body);

    const {
      certificate_id: certificateId,
      destination_branch: destinationBranch,
      certificate_amount: certificateAmount,
      medal_amount: medalAmount,
    } = req.body;

    // Validate certificate_id
    const idValidation = validators.validateCertificateId(certificateId);
    if (!idValidation.valid) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        idValidation.error,
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    const cleanId = idValidation.value;

    // Validate destination branch
    if (!destinationBranch || !destinationBranch.trim()) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "Destination branch is required",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    const destBranch = destinationBranch.trim().toLowerCase();
    if (destBranch !== "mkw" && destBranch !== "kbp") {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "Invalid destination branch. Must be 'mkw' or 'kbp'",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    // Validate amounts
    const certValidation = validators.validatePositiveInteger(
      certificateAmount || 0,
      "Certificate amount",
    );
    if (!certValidation.valid) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        certValidation.error,
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }
    const certAmount = certValidation.value;

    const medalValidation = validators.validatePositiveInteger(
      medalAmount || 0,
      "Medal amount",
    );
    if (!medalValidation.valid) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        medalValidation.error,
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }
    const medalAmountValue = medalValidation.value;

    if (certAmount <= 0 && medalAmountValue <= 0) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        "At least one amount (certificates or medals) must be greater than 0",
        CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
      );
    }

    // Get certificate with lock
    const certResult = await client.query(
      "SELECT * FROM certificates WHERE certificate_id = $1 FOR UPDATE",
      [cleanId],
    );

    if (certResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.NOT_FOUND,
        "Certificate not found",
        CONSTANTS.ERROR_CODES.NOT_FOUND,
      );
    }

    const certificate = certResult.rows[0];

    // Check stock
    if (certAmount > 0 && certificate.jumlah_sertifikat_snd < certAmount) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        `Insufficient SND certificate stock in this batch. Available: ${certificate.jumlah_sertifikat_snd}, Requested: ${certAmount}`,
        CONSTANTS.ERROR_CODES.INSUFFICIENT_STOCK,
      );
    }

    if (
      medalAmountValue > 0 &&
      certificate.jumlah_medali_snd < medalAmountValue
    ) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.BAD_REQUEST,
        `Insufficient SND medal stock in this batch. Available: ${certificate.jumlah_medali_snd}, Requested: ${medalAmountValue}`,
        CONSTANTS.ERROR_CODES.INSUFFICIENT_STOCK,
      );
    }

    // Calculate new amounts
    const newSndCert = certificate.jumlah_sertifikat_snd - certAmount;
    const newSndMedal = certificate.jumlah_medali_snd - medalAmountValue;

    let newDestCert, newDestMedal;
    if (destBranch === "mkw") {
      newDestCert = certificate.jumlah_sertifikat_mkw + certAmount;
      newDestMedal = certificate.jumlah_medali_mkw + medalAmountValue;
    } else {
      newDestCert = certificate.jumlah_sertifikat_kbp + certAmount;
      newDestMedal = certificate.jumlah_medali_kbp + medalAmountValue;
    }

    // Update
    const destCertField =
      destBranch === "mkw" ? "jumlah_sertifikat_mkw" : "jumlah_sertifikat_kbp";
    const destMedalField =
      destBranch === "mkw" ? "jumlah_medali_mkw" : "jumlah_medali_kbp";

    const updateQuery = `
      UPDATE certificates 
      SET jumlah_sertifikat_snd = $1,
          jumlah_medali_snd = $2,
          ${destCertField} = $3,
          ${destMedalField} = $4,
          updated_at = CURRENT_TIMESTAMP
      WHERE certificate_id = $5
      RETURNING *
    `;

    const result = await client.query(updateQuery, [
      newSndCert,
      newSndMedal,
      newDestCert,
      newDestMedal,
      cleanId,
    ]);

    // Log action
    const migrationItems = [];
    if (certAmount > 0) migrationItems.push(`${certAmount} certificate(s)`);
    if (medalAmountValue > 0)
      migrationItems.push(`${medalAmountValue} medal(s)`);

    await client.query(
      `INSERT INTO certificate_logs 
       (certificate_id, action_type, description, from_branch, to_branch, 
        certificate_amount, medal_amount, old_values, new_values, performed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        cleanId,
        CONSTANTS.LOG_ACTION_TYPES.MIGRATE,
        `Migrated ${migrationItems.join(" and ")} from SND to ${destBranch.toUpperCase()} (Batch: ${cleanId})`,
        "snd",
        destBranch,
        certAmount,
        medalAmountValue,
        JSON.stringify({
          snd_certs: certificate.jumlah_sertifikat_snd,
          snd_medals: certificate.jumlah_medali_snd,
          dest_certs:
            destBranch === "mkw"
              ? certificate.jumlah_sertifikat_mkw
              : certificate.jumlah_sertifikat_kbp,
          dest_medals:
            destBranch === "mkw"
              ? certificate.jumlah_medali_mkw
              : certificate.jumlah_medali_kbp,
        }),
        JSON.stringify({
          snd_certs: newSndCert,
          snd_medals: newSndMedal,
          dest_certs: newDestCert,
          dest_medals: newDestMedal,
        }),
        req.user?.username || "System",
      ],
    );

    await client.query("COMMIT");

    logger.info(
      `Migration successful: ${migrationItems.join(" and ")} from SND to ${destBranch.toUpperCase()}`,
    );

    return sendSuccess(
      res,
      `Successfully migrated ${migrationItems.join(" and ")} from SND to ${destBranch.toUpperCase()}`,
      result.rows[0],
      {
        migration: {
          certificate_id: cleanId,
          from: "snd",
          to: destBranch,
          certificates: {
            amount: certAmount,
            previous_snd: certificate.jumlah_sertifikat_snd,
            new_snd: newSndCert,
            previous_dest:
              destBranch === "mkw"
                ? certificate.jumlah_sertifikat_mkw
                : certificate.jumlah_sertifikat_kbp,
            new_dest: newDestCert,
          },
          medals: {
            amount: medalAmountValue,
            previous_snd: certificate.jumlah_medali_snd,
            new_snd: newSndMedal,
            previous_dest:
              destBranch === "mkw"
                ? certificate.jumlah_medali_mkw
                : certificate.jumlah_medali_kbp,
            new_dest: newDestMedal,
          },
        },
      },
    );
  } catch (error) {
    await client.query("ROLLBACK");
    return sendError(
      res,
      CONSTANTS.HTTP_STATUS.SERVER_ERROR,
      "Failed to migrate certificate",
      CONSTANTS.ERROR_CODES.SERVER_ERROR,
      error,
    );
  } finally {
    client.release();
  }
};

// =====================================================
// 8. GET STOCK SUMMARY
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
        certificates:
          (parseInt(summary.snd_cert) || 0) +
          (parseInt(summary.mkw_cert) || 0) +
          (parseInt(summary.kbp_cert) || 0),
        medals:
          (parseInt(summary.snd_medal) || 0) +
          (parseInt(summary.mkw_medal) || 0) +
          (parseInt(summary.kbp_medal) || 0),
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
// 9. GET TRANSACTION HISTORY
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
  updateCertificate,
  deleteCertificate,
  clearAllCertificates,
  migrateCertificate,
  getStockSummary,
  getTransactionHistory,
};
