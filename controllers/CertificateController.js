const pool = require("../config/database");

// Create new certificate entry
const createCertificate = async (req, res) => {
  try {
    const { certificate_id, jumlah_kbp, jumlah_snd, jumlah_mkw } = req.body;

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

    // Untuk setiap branch, jumlah certificate = medali awal
    const kbp = jumlah_kbp || 0;
    const snd = jumlah_snd || 0;
    const mkw = jumlah_mkw || 0;

    // Insert new certificate
    const result = await pool.query(
      `INSERT INTO certificates 
       (certificate_id, jumlah_kbp, medali_awal_kbp, jumlah_snd, medali_awal_snd, 
        jumlah_mkw, medali_awal_mkw) 
       VALUES ($1, $2, $2, $3, $3, $4, $4) 
       RETURNING *`,
      [certificate_id, kbp, snd, mkw],
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
    const { jumlah_kbp, jumlah_snd, jumlah_mkw } = req.body;

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

    // Untuk setiap branch, jumlah certificate = medali awal
    const kbp = jumlah_kbp !== undefined ? jumlah_kbp : current.jumlah_kbp;
    const snd = jumlah_snd !== undefined ? jumlah_snd : current.jumlah_snd;
    const mkw = jumlah_mkw !== undefined ? jumlah_mkw : current.jumlah_mkw;

    // Update certificate
    const result = await pool.query(
      `UPDATE certificates 
       SET jumlah_kbp = $1, medali_awal_kbp = $1,
           jumlah_snd = $2, medali_awal_snd = $2,
           jumlah_mkw = $3, medali_awal_mkw = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE certificate_id = $4
       RETURNING *`,
      [kbp, snd, mkw, id],
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

// Migrate stock from SND to other branches
const migrateCertificate = async (req, res) => {
  try {
    const { certificate_id, destination_branch, amount } = req.body;

    // Validasi input
    if (!certificate_id || !destination_branch || !amount) {
      return res.status(400).json({
        success: false,
        message: "Certificate ID, destination branch, and amount are required",
      });
    }

    // Validasi destination branch
    if (destination_branch !== "mkw" && destination_branch !== "kbp") {
      return res.status(400).json({
        success: false,
        message: "Invalid destination branch. Must be 'mkw' or 'kbp'",
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

    // Check if SND has enough stock
    if (certificate.jumlah_snd < transferAmount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient SND stock. Available: ${certificate.jumlah_snd}, Requested: ${transferAmount}`,
      });
    }

    // Calculate new amounts
    const newSndAmount = certificate.jumlah_snd - transferAmount;
    let newDestAmount;
    let updateQuery;

    if (destination_branch === "mkw") {
      newDestAmount = certificate.jumlah_mkw + transferAmount;
      updateQuery = `
        UPDATE certificates 
        SET jumlah_snd = $1, 
            jumlah_mkw = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE certificate_id = $3
        RETURNING *
      `;
    } else {
      // kbp
      newDestAmount = certificate.jumlah_kbp + transferAmount;
      updateQuery = `
        UPDATE certificates 
        SET jumlah_snd = $1, 
            jumlah_kbp = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE certificate_id = $3
        RETURNING *
      `;
    }

    // Execute migration
    const result = await pool.query(updateQuery, [
      newSndAmount,
      newDestAmount,
      certificate_id,
    ]);

    res.json({
      success: true,
      message: `Successfully migrated ${transferAmount} certificates from SND to ${destination_branch.toUpperCase()}`,
      data: result.rows[0],
      migration: {
        from: "snd",
        to: destination_branch,
        amount: transferAmount,
        previous_snd: certificate.jumlah_snd,
        new_snd: newSndAmount,
        previous_dest:
          destination_branch === "mkw"
            ? certificate.jumlah_mkw
            : certificate.jumlah_kbp,
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
