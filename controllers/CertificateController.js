const pool = require("../config/database");

// Create new certificate entry
const createCertificate = async (req, res) => {
  try {
    const {
      certificate_id,
      jumlah_sertifikat_kbp,
      jumlah_medali_kbp,
      jumlah_sertifikat_snd,
      jumlah_medali_snd,
      jumlah_sertifikat_mkw,
      jumlah_medali_mkw,
    } = req.body;

    // Validasi input
    if (!certificate_id) {
      return res.status(400).json({
        success: false,
        message: "Certificate ID is required",
      });
    }

    // Check if certificate_id already exists
    const checkExisting = await pool.query(
      "SELECT * FROM certificates WHERE certificate_id = $1",
      [certificate_id],
    );

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

    // Insert new certificate with separate medal and certificate counts
    const result = await pool.query(
      `INSERT INTO certificates 
       (certificate_id, 
        jumlah_sertifikat_kbp, jumlah_medali_kbp, medali_awal_kbp,
        jumlah_sertifikat_snd, jumlah_medali_snd, medali_awal_snd,
        jumlah_sertifikat_mkw, jumlah_medali_mkw, medali_awal_mkw) 
       VALUES ($1, $2, $3, $3, $4, $5, $5, $6, $7, $7) 
       RETURNING *`,
      [
        certificate_id,
        sert_kbp,
        medal_kbp,
        sert_snd,
        medal_snd,
        sert_mkw,
        medal_mkw,
      ],
    );

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

// Get all certificates
const getAllCertificates = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM certificates ORDER BY created_at DESC",
    );

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

// Get certificate by ID
const getCertificateById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "SELECT * FROM certificates WHERE certificate_id = $1",
      [id],
    );

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

// Update certificate
const updateCertificate = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      jumlah_sertifikat_kbp,
      jumlah_medali_kbp,
      jumlah_sertifikat_snd,
      jumlah_medali_snd,
      jumlah_sertifikat_mkw,
      jumlah_medali_mkw,
    } = req.body;

    // Check if certificate exists
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

    const current = checkExisting.rows[0];

    // Use current values if not provided
    const sert_kbp =
      jumlah_sertifikat_kbp !== undefined
        ? jumlah_sertifikat_kbp
        : current.jumlah_sertifikat_kbp;
    const medal_kbp =
      jumlah_medali_kbp !== undefined
        ? jumlah_medali_kbp
        : current.jumlah_medali_kbp;
    const sert_snd =
      jumlah_sertifikat_snd !== undefined
        ? jumlah_sertifikat_snd
        : current.jumlah_sertifikat_snd;
    const medal_snd =
      jumlah_medali_snd !== undefined
        ? jumlah_medali_snd
        : current.jumlah_medali_snd;
    const sert_mkw =
      jumlah_sertifikat_mkw !== undefined
        ? jumlah_sertifikat_mkw
        : current.jumlah_sertifikat_mkw;
    const medal_mkw =
      jumlah_medali_mkw !== undefined
        ? jumlah_medali_mkw
        : current.jumlah_medali_mkw;

    // Update certificate
    const result = await pool.query(
      `UPDATE certificates 
       SET jumlah_sertifikat_kbp = $1, jumlah_medali_kbp = $2, medali_awal_kbp = $2,
           jumlah_sertifikat_snd = $3, jumlah_medali_snd = $4, medali_awal_snd = $4,
           jumlah_sertifikat_mkw = $5, jumlah_medali_mkw = $6, medali_awal_mkw = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE certificate_id = $7
       RETURNING *`,
      [sert_kbp, medal_kbp, sert_snd, medal_snd, sert_mkw, medal_mkw, id],
    );

    res.json({
      success: true,
      message: "Certificate updated successfully",
      data: result.rows[0],
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

// Delete certificate
const deleteCertificate = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if certificate exists
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

    // Delete certificate
    await pool.query("DELETE FROM certificates WHERE certificate_id = $1", [
      id,
    ]);

    res.json({
      success: true,
      message: "Certificate deleted successfully",
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

// Migrate stock from SND to other branches (certificates or medals)
const migrateCertificate = async (req, res) => {
  try {
    const { certificate_id, destination_branch, amount, type } = req.body;

    // Validasi input
    if (!certificate_id || !destination_branch || !amount || !type) {
      return res.status(400).json({
        success: false,
        message:
          "Certificate ID, destination branch, amount, and type are required",
      });
    }

    // Validasi destination branch
    if (destination_branch !== "mkw" && destination_branch !== "kbp") {
      return res.status(400).json({
        success: false,
        message: "Invalid destination branch. Must be 'mkw' or 'kbp'",
      });
    }

    // Validasi type
    if (type !== "certificate" && type !== "medal") {
      return res.status(400).json({
        success: false,
        message: "Invalid type. Must be 'certificate' or 'medal'",
      });
    }

    // Validasi amount
    const transferAmount = parseInt(amount);
    if (isNaN(transferAmount) || transferAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be a positive number",
      });
    }

    // Get current certificate data
    const certResult = await pool.query(
      "SELECT * FROM certificates WHERE certificate_id = $1",
      [certificate_id],
    );

    if (certResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Certificate not found",
      });
    }

    const certificate = certResult.rows[0];

    // Determine source field based on type
    let sourceField, destField, sourceAmount, destAmount;

    if (type === "certificate") {
      sourceField = "jumlah_sertifikat_snd";
      sourceAmount = certificate.jumlah_sertifikat_snd;

      if (destination_branch === "mkw") {
        destField = "jumlah_sertifikat_mkw";
        destAmount = certificate.jumlah_sertifikat_mkw;
      } else {
        destField = "jumlah_sertifikat_kbp";
        destAmount = certificate.jumlah_sertifikat_kbp;
      }
    } else {
      // medal
      sourceField = "jumlah_medali_snd";
      sourceAmount = certificate.jumlah_medali_snd;

      if (destination_branch === "mkw") {
        destField = "jumlah_medali_mkw";
        destAmount = certificate.jumlah_medali_mkw;
      } else {
        destField = "jumlah_medali_kbp";
        destAmount = certificate.jumlah_medali_kbp;
      }
    }

    // Check if SND has enough stock
    if (sourceAmount < transferAmount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient SND ${type} stock. Available: ${sourceAmount}, Requested: ${transferAmount}`,
      });
    }

    // Calculate new amounts
    const newSourceAmount = sourceAmount - transferAmount;
    const newDestAmount = destAmount + transferAmount;

    // Build dynamic update query
    const updateQuery = `
      UPDATE certificates 
      SET ${sourceField} = $1, 
          ${destField} = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE certificate_id = $3
      RETURNING *
    `;

    // Execute migration
    const result = await pool.query(updateQuery, [
      newSourceAmount,
      newDestAmount,
      certificate_id,
    ]);

    res.json({
      success: true,
      message: `Successfully migrated ${transferAmount} ${type}s from SND to ${destination_branch.toUpperCase()}`,
      data: result.rows[0],
      migration: {
        type: type,
        from: "snd",
        to: destination_branch,
        amount: transferAmount,
        previous_snd: sourceAmount,
        new_snd: newSourceAmount,
        previous_dest: destAmount,
        new_dest: newDestAmount,
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

module.exports = {
  createCertificate,
  getAllCertificates,
  getCertificateById,
  updateCertificate,
  deleteCertificate,
  migrateCertificate,
};
