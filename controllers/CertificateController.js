const pool = require("../config/database");
const { logAction } = require("./CertificateLogsController");

// =====================================================
// 1. CREATE NEW CERTIFICATE (INPUT BATCH)
// =====================================================
const createCertificate = async (req, res) => {
  try {
    console.log("📥 Received request body:", req.body);

    const { certificate_id, jumlah_sertifikat_kbp, jumlah_medali_kbp, jumlah_sertifikat_snd, jumlah_medali_snd, jumlah_sertifikat_mkw, jumlah_medali_mkw } = req.body;

    // Validasi input
    if (!certificate_id) {
      return res.status(400).json({
        success: false,
        message: "Certificate ID is required",
      });
    }

    // Check if certificate_id already exists
    const checkExisting = await pool.query("SELECT * FROM certificates WHERE certificate_id = $1", [certificate_id]);

    if (checkExisting.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Certificate ID already exists",
      });
    }

    // Set defaults for each branch
    const sert_kbp = jumlah_sertifikat_kbp || 0;
    const medal_kbp = jumlah_medali_kbp || 0;
    const sert_snd = jumlah_sertifikat_snd || 0;
    const medal_snd = jumlah_medali_snd || 0;
    const sert_mkw = jumlah_sertifikat_mkw || 0;
    const medal_mkw = jumlah_medali_mkw || 0;

    // NEW: Validation - at least one branch must have input
    const totalInput = sert_kbp + medal_kbp + sert_snd + medal_snd + sert_mkw + medal_mkw;

    if (totalInput === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one certificate or medal must be greater than 0 for any branch",
      });
    }

    console.log("📊 Processed values:", {
      certificate_id,
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
      [certificate_id, sert_kbp, medal_kbp, sert_snd, medal_snd, sert_mkw, medal_mkw],
    );

    console.log("✅ Certificate created:", result.rows[0]);

    // Log the action
    await logAction({
      certificate_id: certificate_id,
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

    const result = await pool.query("SELECT * FROM certificates WHERE certificate_id = $1", [id]);

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

    /* ORIGINAL CODE - KEPT FOR REFERENCE
    const { id } = req.params;
    // ... rest of update logic
    */
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

    /* ORIGINAL CODE WITH BUG - KEPT FOR REFERENCE
    const { id } = req.params;
    
    const checkExisting = await pool.query(
      "SELECT * FROM certificates WHERE certificate_id = $1",
      [id],
    );

    if (checkExisting.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Certificate not found",
      });
    }

    await pool.query("DELETE FROM certificates WHERE certificate_id = $1", [id]);

    await logAction({
      certificate_id: id,
      action_type: "DELETE",
      description: `Deleted certificate batch`,
      old_values: checkExisting.rows[0],
      performed_by: req.user?.username || "System",
    });

    res.json({
      success: true,
      message: "Certificate deleted successfully",
    });

    // BUG WAS HERE: Duplicate log with wrong parameters
    await logAction({
      certificate_id: certificate_id, // UNDEFINED!
      action_type: "MIGRATE", // WRONG ACTION TYPE!
      // ... rest of wrong parameters
    });
    */
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
  try {
    console.log("🔄 Migrate request body:", req.body);

    const { certificate_id, destination_branch, certificate_amount, medal_amount } = req.body;

    // Validasi input
    if (!certificate_id || !destination_branch) {
      return res.status(400).json({
        success: false,
        message: "Certificate ID and destination branch are required",
      });
    }

    // Validasi destination branch
    if (destination_branch !== "mkw" && destination_branch !== "kbp") {
      return res.status(400).json({
        success: false,
        message: "Invalid destination branch. Must be 'mkw' or 'kbp'",
      });
    }

    // Parse amounts - default to 0 if not provided
    const certAmount = parseInt(certificate_amount) || 0;
    const medalAmount = parseInt(medal_amount) || 0;

    // At least one must be greater than 0
    if (certAmount <= 0 && medalAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "At least one amount (certificates or medals) must be greater than 0",
      });
    }

    // NEW: Check total pool stock first (sum all batches)
    const poolCheck = await pool.query("SELECT SUM(jumlah_sertifikat_snd) as total_cert, SUM(jumlah_medali_snd) as total_medal FROM certificates");

    const totalPoolCert = parseInt(poolCheck.rows[0].total_cert) || 0;
    const totalPoolMedal = parseInt(poolCheck.rows[0].total_medal) || 0;

    console.log("📊 Current SND Pool:", {
      total_cert: totalPoolCert,
      total_medal: totalPoolMedal,
    });

    // Validate sufficient stock in pool
    if (certAmount > totalPoolCert) {
      return res.status(400).json({
        success: false,
        message: `Insufficient SND certificate stock in total pool. Available: ${totalPoolCert}, Requested: ${certAmount}`,
      });
    }

    if (medalAmount > totalPoolMedal) {
      return res.status(400).json({
        success: false,
        message: `Insufficient SND medal stock in total pool. Available: ${totalPoolMedal}, Requested: ${medalAmount}`,
      });
    }

    // Get current certificate data
    const certResult = await pool.query("SELECT * FROM certificates WHERE certificate_id = $1", [certificate_id]);

    if (certResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Certificate not found",
      });
    }

    const certificate = certResult.rows[0];
    console.log("📋 Current certificate data:", certificate);

    // Check stock availability in THIS specific batch
    if (certAmount > 0 && certificate.jumlah_sertifikat_snd < certAmount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient SND certificate stock in this batch. Available in ${certificate_id}: ${certificate.jumlah_sertifikat_snd}, Requested: ${certAmount}. Total pool: ${totalPoolCert}`,
      });
    }

    if (medalAmount > 0 && certificate.jumlah_medali_snd < medalAmount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient SND medal stock in this batch. Available in ${certificate_id}: ${certificate.jumlah_medali_snd}, Requested: ${medalAmount}. Total pool: ${totalPoolMedal}`,
      });
    }

    // Calculate new amounts
    const newSndCert = certificate.jumlah_sertifikat_snd - certAmount;
    const newSndMedal = certificate.jumlah_medali_snd - medalAmount;

    let newDestCert, newDestMedal;
    if (destination_branch === "mkw") {
      newDestCert = certificate.jumlah_sertifikat_mkw + certAmount;
      newDestMedal = certificate.jumlah_medali_mkw + medalAmount;
    } else {
      newDestCert = certificate.jumlah_sertifikat_kbp + certAmount;
      newDestMedal = certificate.jumlah_medali_kbp + medalAmount;
    }

    console.log("📊 Migration details:", {
      certAmount,
      medalAmount,
      destination_branch,
      newSndCert,
      newSndMedal,
      newDestCert,
      newDestMedal,
    });

    // Build update query based on destination
    const destCertField = destination_branch === "mkw" ? "jumlah_sertifikat_mkw" : "jumlah_sertifikat_kbp";
    const destMedalField = destination_branch === "mkw" ? "jumlah_medali_mkw" : "jumlah_medali_kbp";

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

    console.log("📝 Update query params:", [newSndCert, newSndMedal, newDestCert, newDestMedal, certificate_id]);

    // Execute migration
    const result = await pool.query(updateQuery, [newSndCert, newSndMedal, newDestCert, newDestMedal, certificate_id]);

    console.log("✅ Migration successful:", result.rows[0]);

    // Build migration summary message
    const migrationItems = [];
    if (certAmount > 0) migrationItems.push(`${certAmount} certificate(s)`);
    if (medalAmount > 0) migrationItems.push(`${medalAmount} medal(s)`);

    // FIXED: Add logging for migration (this was missing!)
    await logAction({
      certificate_id: certificate_id,
      action_type: "MIGRATE",
      description: `Migrated ${migrationItems.join(" and ")} from SND to ${destination_branch.toUpperCase()} (Batch: ${certificate_id})`,
      from_branch: "snd",
      to_branch: destination_branch,
      certificate_amount: certAmount,
      medal_amount: medalAmount,
      old_values: {
        snd_certs: certificate.jumlah_sertifikat_snd,
        snd_medals: certificate.jumlah_medali_snd,
        dest_certs: destination_branch === "mkw" ? certificate.jumlah_sertifikat_mkw : certificate.jumlah_sertifikat_kbp,
        dest_medals: destination_branch === "mkw" ? certificate.jumlah_medali_mkw : certificate.jumlah_medali_kbp,
      },
      new_values: {
        snd_certs: newSndCert,
        snd_medals: newSndMedal,
        dest_certs: newDestCert,
        dest_medals: newDestMedal,
      },
      performed_by: req.user?.username || "System",
    });

    res.json({
      success: true,
      message: `Successfully migrated ${migrationItems.join(" and ")} from SND to ${destination_branch.toUpperCase()}`,
      data: result.rows[0],
      migration: {
        certificate_id: certificate_id,
        from: "snd",
        to: destination_branch,
        certificates: {
          amount: certAmount,
          previous_snd: certificate.jumlah_sertifikat_snd,
          new_snd: newSndCert,
          previous_dest: destination_branch === "mkw" ? certificate.jumlah_sertifikat_mkw : certificate.jumlah_sertifikat_kbp,
          new_dest: newDestCert,
        },
        medals: {
          amount: medalAmount,
          previous_snd: certificate.jumlah_medali_snd,
          new_snd: newSndMedal,
          previous_dest: destination_branch === "mkw" ? certificate.jumlah_medali_mkw : certificate.jumlah_medali_kbp,
          new_dest: newDestMedal,
        },
      },
      pool_status: {
        snd_remaining: {
          certificates: totalPoolCert - certAmount,
          medals: totalPoolMedal - medalAmount,
        },
      },
    });
  } catch (error) {
    console.error("Migrate certificate error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
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
    if (from_date) {
      query += ` AND created_at >= $${paramCount}`;
      params.push(from_date);
      paramCount++;
    }

    if (to_date) {
      query += ` AND created_at <= $${paramCount}`;
      params.push(to_date + " 23:59:59");
      paramCount++;
    }

    // Order by most recent first
    query += ` ORDER BY created_at DESC`;

    // Pagination
    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count for pagination
    let countQuery = "SELECT COUNT(*) FROM certificates WHERE 1=1";
    const countParams = [];
    let countParamNum = 1;

    if (from_date) {
      countQuery += ` AND created_at >= $${countParamNum}`;
      countParams.push(from_date);
      countParamNum++;
    }

    if (to_date) {
      countQuery += ` AND created_at <= $${countParamNum}`;
      countParams.push(to_date + " 23:59:59");
      countParamNum++;
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: totalCount > parseInt(offset) + result.rows.length,
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
