const pool = require("../config/database");
const { logAction } = require("./CertificateLogsController");

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
    return { valid: false, error: `${fieldName} exceeds maximum value of ${maxValue}` };
  }
  return { valid: true, value: num };
}

// =====================================================
// 1. CREATE NEW CERTIFICATE (INPUT BATCH)
// =====================================================
const createCertificate = async (req, res) => {
  try {
    console.log("📥 Received request body:", req.body);

    const { certificate_id, jumlah_sertifikat_kbp, jumlah_medali_kbp, jumlah_sertifikat_snd, jumlah_medali_snd, jumlah_sertifikat_mkw, jumlah_medali_mkw } = req.body;

    // Validasi input
    if (!certificate_id || !certificate_id.trim()) {
      return res.status(400).json({
        success: false,
        message: "Certificate ID is required",
      });
    }

    // Check if certificate_id already exists
    const checkExisting = await pool.query("SELECT * FROM certificates WHERE certificate_id = $1", [certificate_id.trim()]);

    if (checkExisting.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Certificate ID already exists",
      });
    }

    // Validate and parse all numeric inputs
    const validations = [
      { value: jumlah_sertifikat_kbp || 0, name: "KBP Certificates", key: "sert_kbp" },
      { value: jumlah_medali_kbp || 0, name: "KBP Medals", key: "medal_kbp" },
      { value: jumlah_sertifikat_snd || 0, name: "SND Certificates", key: "sert_snd" },
      { value: jumlah_medali_snd || 0, name: "SND Medals", key: "medal_snd" },
      { value: jumlah_sertifikat_mkw || 0, name: "MKW Certificates", key: "sert_mkw" },
      { value: jumlah_medali_mkw || 0, name: "MKW Medals", key: "medal_mkw" },
    ];

    const validated = {};
    for (const field of validations) {
      const result = validatePositiveInteger(field.value, field.name);
      if (!result.valid) {
        return res.status(400).json({
          success: false,
          message: result.error,
        });
      }
      validated[field.key] = result.value;
    }

    const sert_kbp = validated.sert_kbp;
    const medal_kbp = validated.medal_kbp;
    const sert_snd = validated.sert_snd;
    const medal_snd = validated.medal_snd;
    const sert_mkw = validated.sert_mkw;
    const medal_mkw = validated.medal_mkw;

    // Validation - at least one branch must have input
    const totalInput = sert_kbp + medal_kbp + sert_snd + medal_snd + sert_mkw + medal_mkw;

    if (totalInput === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one certificate or medal must be greater than 0 for any branch",
      });
    }

    console.log("📊 Processed values:", {
      certificate_id: certificate_id.trim(),
      sert_kbp,
      medal_kbp,
      sert_snd,
      medal_snd,
      sert_mkw,
      medal_mkw,
    });

    // Insert new certificate
    // medali_awal_* stores the INITIAL medal count and should not change
    const result = await pool.query(
      `INSERT INTO certificates 
       (certificate_id, 
        jumlah_sertifikat_kbp, jumlah_medali_kbp, medali_awal_kbp,
        jumlah_sertifikat_snd, jumlah_medali_snd, medali_awal_snd,
        jumlah_sertifikat_mkw, jumlah_medali_mkw, medali_awal_mkw) 
       VALUES ($1, $2, $3, $3, $4, $5, $5, $6, $7, $7) 
       RETURNING *`,
      [certificate_id.trim(), sert_kbp, medal_kbp, sert_snd, medal_snd, sert_mkw, medal_mkw],
    );

    console.log("✅ Certificate created:", result.rows[0]);

    // Log the action
    await logAction({
      certificate_id: certificate_id.trim(),
      action_type: "CREATE",
      description: `Created new certificate batch: SND: ${sert_snd} certs, ${medal_snd} medals | MKW: ${sert_mkw} certs, ${medal_mkw} medals | KBP: ${sert_kbp} certs, ${medal_kbp} medals`,
      new_values: result.rows[0],
      performed_by: req.user?.username || "System",
    });

    res.status(201).json({
      success: true,
      message: "Certificate created successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Create certificate error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// =====================================================
// 2. GET ALL CERTIFICATES
// =====================================================
const getAllCertificates = async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM certificates ORDER BY created_at DESC");

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error("Get certificates error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// =====================================================
// 3. GET CERTIFICATE BY ID
// =====================================================
const getCertificateById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !id.trim()) {
      return res.status(400).json({
        success: false,
        message: "Certificate ID is required",
      });
    }

    const result = await pool.query("SELECT * FROM certificates WHERE certificate_id = $1", [id.trim()]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Certificate not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Get certificate error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// =====================================================
// 4. UPDATE CERTIFICATE (DISABLED)
// =====================================================
const updateCertificate = async (req, res) => {
  try {
    // DISABLED: Edit function is not allowed in the new system
    return res.status(403).json({
      success: false,
      message: "Update operation is not allowed. Please create a new batch for adjustments or use migration feature.",
      reason: "To maintain accurate audit trail and prevent stock discrepancies, editing existing batches is disabled.",
    });
  } catch (error) {
    console.error("Update certificate error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// =====================================================
// 5. DELETE CERTIFICATE (DISABLED)
// =====================================================
const deleteCertificate = async (req, res) => {
  try {
    // DISABLED: Delete function is not allowed in the new system
    return res.status(403).json({
      success: false,
      message: "Delete operation is not allowed. Batches are permanent records for audit purposes.",
      reason: "To maintain complete transaction history and audit trail, deleting batches is disabled. If you need to correct an error, create an adjustment batch.",
    });
  } catch (error) {
    console.error("Delete certificate error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// =====================================================
// 6. MIGRATE STOCK FROM SND TO OTHER BRANCHES
// =====================================================
const migrateCertificate = async (req, res) => {
  // Start transaction
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    console.log("🔄 Migrate request body:", req.body);

    const { certificate_id, destination_branch, certificate_amount, medal_amount } = req.body;

    // Validasi input
    if (!certificate_id || !certificate_id.trim() || !destination_branch || !destination_branch.trim()) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Certificate ID and destination branch are required",
      });
    }

    // Validasi destination branch
    const destBranch = destination_branch.trim().toLowerCase();
    if (destBranch !== "mkw" && destBranch !== "kbp") {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Invalid destination branch. Must be 'mkw' or 'kbp'",
      });
    }

    // Validate certificate_amount
    const certValidation = validatePositiveInteger(certificate_amount || 0, "Certificate amount");
    if (!certValidation.valid) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: certValidation.error,
      });
    }
    const certAmount = certValidation.value;

    // Validate medal_amount
    const medalValidation = validatePositiveInteger(medal_amount || 0, "Medal amount");
    if (!medalValidation.valid) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: medalValidation.error,
      });
    }
    const medalAmount = medalValidation.value;

    // At least one must be greater than 0
    if (certAmount <= 0 && medalAmount <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "At least one amount (certificates or medals) must be greater than 0",
      });
    }

    // Get current certificate data WITH ROW LOCK to prevent race condition
    const certResult = await client.query("SELECT * FROM certificates WHERE certificate_id = $1 FOR UPDATE", [certificate_id.trim()]);

    if (certResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Certificate not found",
      });
    }

    const certificate = certResult.rows[0];
    console.log("📋 Current certificate data:", certificate);

    // Check stock availability in THIS specific batch
    if (certAmount > 0 && certificate.jumlah_sertifikat_snd < certAmount) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: `Insufficient SND certificate stock in this batch. Available in ${certificate_id}: ${certificate.jumlah_sertifikat_snd}, Requested: ${certAmount}`,
      });
    }

    if (medalAmount > 0 && certificate.jumlah_medali_snd < medalAmount) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: `Insufficient SND medal stock in this batch. Available in ${certificate_id}: ${certificate.jumlah_medali_snd}, Requested: ${medalAmount}`,
      });
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

    console.log("📊 Migration details:", {
      certAmount,
      medalAmount,
      destination_branch: destBranch,
      newSndCert,
      newSndMedal,
      newDestCert,
      newDestMedal,
    });

    // Build update query based on destination
    const destCertField = destBranch === "mkw" ? "jumlah_sertifikat_mkw" : "jumlah_sertifikat_kbp";
    const destMedalField = destBranch === "mkw" ? "jumlah_medali_mkw" : "jumlah_medali_kbp";

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

    console.log("📝 Update query params:", [newSndCert, newSndMedal, newDestCert, newDestMedal, certificate_id.trim()]);

    // Execute migration within transaction
    const result = await client.query(updateQuery, [newSndCert, newSndMedal, newDestCert, newDestMedal, certificate_id.trim()]);

    console.log("✅ Migration successful:", result.rows[0]);

    // Build migration summary message
    const migrationItems = [];
    if (certAmount > 0) migrationItems.push(`${certAmount} certificate(s)`);
    if (medalAmount > 0) migrationItems.push(`${medalAmount} medal(s)`);

    // Log action
    await logAction({
      certificate_id: certificate_id.trim(),
      action_type: "MIGRATE",
      description: `Migrated ${migrationItems.join(" and ")} from SND to ${destBranch.toUpperCase()} (Batch: ${certificate_id.trim()})`,
      from_branch: "snd",
      to_branch: destBranch,
      certificate_amount: certAmount,
      medal_amount: medalAmount,
      old_values: {
        snd_certs: certificate.jumlah_sertifikat_snd,
        snd_medals: certificate.jumlah_medali_snd,
        dest_certs: destBranch === "mkw" ? certificate.jumlah_sertifikat_mkw : certificate.jumlah_sertifikat_kbp,
        dest_medals: destBranch === "mkw" ? certificate.jumlah_medali_mkw : certificate.jumlah_medali_kbp,
      },
      new_values: {
        snd_certs: newSndCert,
        snd_medals: newSndMedal,
        dest_certs: newDestCert,
        dest_medals: newDestMedal,
      },
      performed_by: req.user?.username || "System",
    });

    // Commit transaction
    await client.query("COMMIT");

    res.json({
      success: true,
      message: `Successfully migrated ${migrationItems.join(" and ")} from SND to ${destBranch.toUpperCase()}`,
      data: result.rows[0],
      migration: {
        certificate_id: certificate_id.trim(),
        from: "snd",
        to: destBranch,
        certificates: {
          amount: certAmount,
          previous_snd: certificate.jumlah_sertifikat_snd,
          new_snd: newSndCert,
          previous_dest: destBranch === "mkw" ? certificate.jumlah_sertifikat_mkw : certificate.jumlah_sertifikat_kbp,
          new_dest: newDestCert,
        },
        medals: {
          amount: medalAmount,
          previous_snd: certificate.jumlah_medali_snd,
          new_snd: newSndMedal,
          previous_dest: destBranch === "mkw" ? certificate.jumlah_medali_mkw : certificate.jumlah_medali_kbp,
          new_dest: newDestMedal,
        },
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Migrate certificate error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

// =====================================================
// 7. GET STOCK SUMMARY (NEW FEATURE)
// =====================================================
const getStockSummary = async (req, res) => {
  try {
    console.log("📊 Fetching stock summary...");

    // Calculate total stock across all batches
    const summaryQuery = await pool.query(`
      SELECT 
        SUM(jumlah_sertifikat_snd) as snd_cert,
        SUM(jumlah_medali_snd) as snd_medal,
        SUM(jumlah_sertifikat_mkw) as mkw_cert,
        SUM(jumlah_medali_mkw) as mkw_medal,
        SUM(jumlah_sertifikat_kbp) as kbp_cert,
        SUM(jumlah_medali_kbp) as kbp_medal
      FROM certificates
    `);

    const summary = summaryQuery.rows[0];

    const response = {
      success: true,
      data: {
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
      },
      timestamp: new Date().toISOString(),
    };

    console.log("✅ Stock summary generated:", response.data);

    res.json(response);
  } catch (error) {
    console.error("Get stock summary error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// =====================================================
// 8. GET TRANSACTION HISTORY (NEW FEATURE)
// =====================================================
const getTransactionHistory = async (req, res) => {
  try {
    const { limit = 50, offset = 0, branch, from_date, to_date } = req.query;

    console.log("📜 Fetching transaction history with filters:", req.query);

    // Validate limit and offset
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

    // Filter by date range
    if (from_date && from_date.trim()) {
      query += ` AND created_at >= $${paramCount}`;
      params.push(from_date.trim());
      paramCount++;
    }

    if (to_date && to_date.trim()) {
      query += ` AND created_at <= $${paramCount}::date + interval '1 day' - interval '1 second'`;
      params.push(to_date.trim());
      paramCount++;
    }

    // Order by most recent first
    query += ` ORDER BY created_at DESC`;

    // Pagination
    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(validatedLimit, validatedOffset);

    const result = await pool.query(query, params);

    // Get total count for pagination
    let countQuery = "SELECT COUNT(*) FROM certificates WHERE 1=1";
    const countParams = [];
    let countParamNum = 1;

    if (from_date && from_date.trim()) {
      countQuery += ` AND created_at >= $${countParamNum}`;
      countParams.push(from_date.trim());
      countParamNum++;
    }

    if (to_date && to_date.trim()) {
      countQuery += ` AND created_at <= $${countParamNum}::date + interval '1 day' - interval '1 second'`;
      countParams.push(to_date.trim());
      countParamNum++;
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total: totalCount,
        limit: validatedLimit,
        offset: validatedOffset,
        hasMore: totalCount > validatedOffset + result.rows.length,
      },
    });
  } catch (error) {
    console.error("Get transaction history error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

module.exports = {
  createCertificate,
  getAllCertificates,
  getCertificateById,
  updateCertificate, // Disabled but kept for backward compatibility
  deleteCertificate, // Disabled but kept for backward compatibility
  migrateCertificate,
  getStockSummary, // NEW
  getTransactionHistory, // NEW
};
