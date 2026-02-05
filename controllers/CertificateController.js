const pool = require("../config/database");
const { logAction } = require("./CertificateLogsController");

// =====================================================
// STANDARDIZED ERROR RESPONSE HELPER
// =====================================================
function sendError(res, statusCode, message, error = null) {
  const response = {
    success: false,
    message: message,
  };

  if (error && process.env.NODE_ENV === "development") {
    response.error = error.message;
    response.stack = error.stack;
  }

  console.error(`❌ Error (${statusCode}):`, message, error || "");
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
// VALIDATION HELPERS
// =====================================================
function validatePositiveInteger(value, fieldName, maxValue = 2147483647) {
  const num = parseInt(value);
  if (isNaN(num)) {
    return { valid: false, error: `${fieldName} must be a number` };
  }
  if (num < 0) {
    return { valid: false, error: `${fieldName} cannot be negative` };
  }
  if (!Number.isInteger(num)) {
    return { valid: false, error: `${fieldName} must be an integer` };
  }
  if (num > maxValue) {
    return {
      valid: false,
      error: `${fieldName} exceeds maximum value of ${maxValue}`,
    };
  }
  return { valid: true, value: num };
}

function validateCertificateId(certificate_id) {
  if (!certificate_id || !certificate_id.trim()) {
    return { valid: false, error: "Certificate ID is required" };
  }

  const cleanId = certificate_id.trim();

  if (cleanId.length < 3) {
    return {
      valid: false,
      error: "Certificate ID must be at least 3 characters",
    };
  }

  if (cleanId.length > 50) {
    return {
      valid: false,
      error: "Certificate ID must not exceed 50 characters",
    };
  }

  const validFormat = /^[A-Za-z0-9_-]+$/;
  if (!validFormat.test(cleanId)) {
    return {
      valid: false,
      error:
        "Certificate ID can only contain letters, numbers, dashes, and underscores",
    };
  }

  return { valid: true, value: cleanId };
}

// =====================================================
// 1. CREATE NEW CERTIFICATE
// =====================================================
const createCertificate = async (req, res) => {
  try {
    console.log("📥 Create certificate request:", req.body);

    const {
      certificate_id,
      jumlah_sertifikat_kbp,
      jumlah_medali_kbp,
      jumlah_sertifikat_snd,
      jumlah_medali_snd,
      jumlah_sertifikat_mkw,
      jumlah_medali_mkw,
    } = req.body;

    // Validate certificate_id
    const idValidation = validateCertificateId(certificate_id);
    if (!idValidation.valid) {
      return sendError(res, 400, idValidation.error);
    }

    const cleanId = idValidation.value;

    // Check if exists
    const checkExisting = await pool.query(
      "SELECT * FROM certificates WHERE certificate_id = $1",
      [cleanId],
    );

    if (checkExisting.rows.length > 0) {
      return sendError(res, 409, "Certificate ID already exists");
    }

    // Validate numeric inputs
    const validations = [
      {
        value: jumlah_sertifikat_kbp || 0,
        name: "KBP Certificates",
        key: "sert_kbp",
      },
      {
        value: jumlah_medali_kbp || 0,
        name: "KBP Medals",
        key: "medal_kbp",
      },
      {
        value: jumlah_sertifikat_snd || 0,
        name: "SND Certificates",
        key: "sert_snd",
      },
      { value: jumlah_medali_snd || 0, name: "SND Medals", key: "medal_snd" },
      {
        value: jumlah_sertifikat_mkw || 0,
        name: "MKW Certificates",
        key: "sert_mkw",
      },
      {
        value: jumlah_medali_mkw || 0,
        name: "MKW Medals",
        key: "medal_mkw",
      },
    ];

    const validated = {};
    for (const field of validations) {
      const result = validatePositiveInteger(field.value, field.name);
      if (!result.valid) {
        return sendError(res, 400, result.error);
      }
      validated[field.key] = result.value;
    }

    const sert_kbp = validated.sert_kbp;
    const medal_kbp = validated.medal_kbp;
    const sert_snd = validated.sert_snd;
    const medal_snd = validated.medal_snd;
    const sert_mkw = validated.sert_mkw;
    const medal_mkw = validated.medal_mkw;

    // At least one must be > 0
    const totalInput =
      sert_kbp + medal_kbp + sert_snd + medal_snd + sert_mkw + medal_mkw;

    if (totalInput === 0) {
      return sendError(
        res,
        400,
        "At least one certificate or medal must be greater than 0 for any branch",
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
      [cleanId, sert_kbp, medal_kbp, sert_snd, medal_snd, sert_mkw, medal_mkw],
    );

    console.log("✅ Certificate created:", result.rows[0]);

    // Log action
    await logAction({
      certificate_id: cleanId,
      action_type: "CREATE",
      description: `Created new certificate batch: SND: ${sert_snd} certs, ${medal_snd} medals | MKW: ${sert_mkw} certs, ${medal_mkw} medals | KBP: ${sert_kbp} certs, ${medal_kbp} medals`,
      new_values: result.rows[0],
      performed_by: req.user?.username || "System",
    });

    return sendSuccess(res, "Certificate created successfully", result.rows[0]);
  } catch (error) {
    return sendError(res, 500, "Failed to create certificate", error);
  }
};

// =====================================================
// 2. GET ALL CERTIFICATES (SERVER-SIDE PAGINATION)
// =====================================================
const getAllCertificates = async (req, res) => {
  try {
    const { limit = 5, offset = 0 } = req.query;

    // Validate pagination params
    const validatedLimit = Math.min(Math.max(parseInt(limit) || 5, 1), 100);
    const validatedOffset = Math.max(parseInt(offset) || 0, 0);

    console.log(
      `📥 Get certificates: limit=${validatedLimit}, offset=${validatedOffset}`,
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

    console.log(`✅ Returned ${result.rows.length}/${totalCount} certificates`);

    return sendSuccess(
      res,
      "Certificates retrieved successfully",
      result.rows,
      { pagination, count: result.rows.length },
    );
  } catch (error) {
    return sendError(res, 500, "Failed to retrieve certificates", error);
  }
};

// =====================================================
// 3. GET CERTIFICATE BY ID
// =====================================================
const getCertificateById = async (req, res) => {
  try {
    const { id } = req.params;

    const idValidation = validateCertificateId(id);
    if (!idValidation.valid) {
      return sendError(res, 400, idValidation.error);
    }

    const cleanId = idValidation.value;

    const result = await pool.query(
      "SELECT * FROM certificates WHERE certificate_id = $1",
      [cleanId],
    );

    if (result.rows.length === 0) {
      return sendError(res, 404, "Certificate not found");
    }

    return sendSuccess(
      res,
      "Certificate retrieved successfully",
      result.rows[0],
    );
  } catch (error) {
    return sendError(res, 500, "Failed to retrieve certificate", error);
  }
};

// =====================================================
// 4. UPDATE CERTIFICATE (DISABLED)
// =====================================================
const updateCertificate = async (req, res) => {
  return sendError(
    res,
    403,
    "Update operation is not allowed. Please create a new batch for adjustments or use migration feature.",
  );
};

// =====================================================
// 5. DELETE CERTIFICATE (DISABLED)
// =====================================================
const deleteCertificate = async (req, res) => {
  return sendError(
    res,
    403,
    "Delete operation is not allowed. Batches are permanent records for audit purposes.",
  );
};

// =====================================================
// 6. CLEAR ALL CERTIFICATES
// =====================================================
const clearAllCertificates = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    console.log("🗑️ Clear all certificates requested");

    const allCertsResult = await client.query("SELECT * FROM certificates");
    const allCertificates = allCertsResult.rows;

    if (allCertificates.length === 0) {
      await client.query("ROLLBACK");
      return sendError(res, 400, "No certificates to delete");
    }

    console.log(`📊 Found ${allCertificates.length} certificates to delete`);

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

    console.log(`✅ Deleted ${deleteResult.rows.length} certificates`);

    // Log action
    await client.query(
      `INSERT INTO certificate_logs 
       (certificate_id, action_type, description, certificate_amount, medal_amount, 
        old_values, performed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        "BULK_DELETE",
        "DELETE_ALL",
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
    return sendError(res, 500, "Failed to clear certificates", error);
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

    console.log("🔄 Migrate request:", req.body);

    const {
      certificate_id,
      destination_branch,
      certificate_amount,
      medal_amount,
    } = req.body;

    // Validate certificate_id
    const idValidation = validateCertificateId(certificate_id);
    if (!idValidation.valid) {
      await client.query("ROLLBACK");
      return sendError(res, 400, idValidation.error);
    }

    const cleanId = idValidation.value;

    // Validate destination branch
    if (!destination_branch || !destination_branch.trim()) {
      await client.query("ROLLBACK");
      return sendError(res, 400, "Destination branch is required");
    }

    const destBranch = destination_branch.trim().toLowerCase();
    if (destBranch !== "mkw" && destBranch !== "kbp") {
      await client.query("ROLLBACK");
      return sendError(
        res,
        400,
        "Invalid destination branch. Must be 'mkw' or 'kbp'",
      );
    }

    // Validate amounts
    const certValidation = validatePositiveInteger(
      certificate_amount || 0,
      "Certificate amount",
    );
    if (!certValidation.valid) {
      await client.query("ROLLBACK");
      return sendError(res, 400, certValidation.error);
    }
    const certAmount = certValidation.value;

    const medalValidation = validatePositiveInteger(
      medal_amount || 0,
      "Medal amount",
    );
    if (!medalValidation.valid) {
      await client.query("ROLLBACK");
      return sendError(res, 400, medalValidation.error);
    }
    const medalAmount = medalValidation.value;

    if (certAmount <= 0 && medalAmount <= 0) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        400,
        "At least one amount (certificates or medals) must be greater than 0",
      );
    }

    // Get certificate with lock
    const certResult = await client.query(
      "SELECT * FROM certificates WHERE certificate_id = $1 FOR UPDATE",
      [cleanId],
    );

    if (certResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return sendError(res, 404, "Certificate not found");
    }

    const certificate = certResult.rows[0];

    // Check stock
    if (certAmount > 0 && certificate.jumlah_sertifikat_snd < certAmount) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        400,
        `Insufficient SND certificate stock in this batch. Available: ${certificate.jumlah_sertifikat_snd}, Requested: ${certAmount}`,
      );
    }

    if (medalAmount > 0 && certificate.jumlah_medali_snd < medalAmount) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        400,
        `Insufficient SND medal stock in this batch. Available: ${certificate.jumlah_medali_snd}, Requested: ${medalAmount}`,
      );
    }

    // Calculate new amounts
    const newSndCert = certificate.jumlah_sertifikat_snd - certAmount;
    const newSndMedal = certificate.jumlah_medali_snd - medalAmount;

    let newDestCert, newDestMedal;
    if (destBranch === "mkw") {
      newDestCert = certificate.jumlah_sertifikat_mkw + certAmount;
      newDestMedal = certificate.jumlah_medali_mkw + medalAmount;
    } else {
      newDestCert = certificate.jumlah_sertifikat_kbp + certAmount;
      newDestMedal = certificate.jumlah_medali_kbp + medalAmount;
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
    if (medalAmount > 0) migrationItems.push(`${medalAmount} medal(s)`);

    await client.query(
      `INSERT INTO certificate_logs 
       (certificate_id, action_type, description, from_branch, to_branch, 
        certificate_amount, medal_amount, old_values, new_values, performed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        cleanId,
        "MIGRATE",
        `Migrated ${migrationItems.join(" and ")} from SND to ${destBranch.toUpperCase()} (Batch: ${cleanId})`,
        "snd",
        destBranch,
        certAmount,
        medalAmount,
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
            amount: medalAmount,
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
    return sendError(res, 500, "Failed to migrate certificate", error);
  } finally {
    client.release();
  }
};

// =====================================================
// 8. GET STOCK SUMMARY
// =====================================================
const getStockSummary = async (req, res) => {
  try {
    console.log("📊 Fetching stock summary...");

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

    console.log("✅ Stock summary generated");

    return sendSuccess(res, "Stock summary retrieved successfully", data, {
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return sendError(res, 500, "Failed to retrieve stock summary", error);
  }
};

// =====================================================
// 9. GET TRANSACTION HISTORY
// =====================================================
const getTransactionHistory = async (req, res) => {
  try {
    const { limit = 50, offset = 0, from_date, to_date } = req.query;

    console.log("📜 Fetching transaction history:", req.query);

    const validatedLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 1000);
    const validatedOffset = Math.max(parseInt(offset) || 0, 0);

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

    if (from_date && from_date.trim()) {
      query += ` AND created_at >= $${paramCount}`;
      params.push(from_date.trim());
      paramCount++;
    }

    if (to_date && to_date.trim()) {
      query += ` AND created_at < $${paramCount}::date + interval '1 day'`;
      params.push(to_date.trim());
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

    if (from_date && from_date.trim()) {
      countQuery += ` AND created_at >= $${countParamNum}`;
      countParams.push(from_date.trim());
      countParamNum++;
    }

    if (to_date && to_date.trim()) {
      countQuery += ` AND created_at < $${countParamNum}::date + interval '1 day'`;
      countParams.push(to_date.trim());
      countParamNum++;
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

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
    return sendError(res, 500, "Failed to retrieve transaction history", error);
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
