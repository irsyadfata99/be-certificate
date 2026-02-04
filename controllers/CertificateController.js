const pool = require("../config/database");

// Create new certificate entry
const createCertificate = async (req, res) => {
  try {
    const { certificate_id, jumlah_kbp, jumlah_snd, jumlah_mkw, jumlah_bsd } =
      req.body;

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
    const bsd = jumlah_bsd || 0;

    // Insert new certificate
    const result = await pool.query(
      `INSERT INTO certificates 
       (certificate_id, jumlah_kbp, medali_awal_kbp, jumlah_snd, medali_awal_snd, 
        jumlah_mkw, medali_awal_mkw, jumlah_bsd, medali_awal_bsd) 
       VALUES ($1, $2, $2, $3, $3, $4, $4, $5, $5) 
       RETURNING *`,
      [certificate_id, kbp, snd, mkw, bsd],
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
    const { jumlah_kbp, jumlah_snd, jumlah_mkw, jumlah_bsd } = req.body;

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
    const bsd = jumlah_bsd !== undefined ? jumlah_bsd : current.jumlah_bsd;

    // Update certificate
    const result = await pool.query(
      `UPDATE certificates 
       SET jumlah_kbp = $1, medali_awal_kbp = $1,
           jumlah_snd = $2, medali_awal_snd = $2,
           jumlah_mkw = $3, medali_awal_mkw = $3,
           jumlah_bsd = $4, medali_awal_bsd = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE certificate_id = $5
       RETURNING *`,
      [kbp, snd, mkw, bsd, id],
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

module.exports = {
  createCertificate,
  getAllCertificates,
  getCertificateById,
  updateCertificate,
  deleteCertificate,
};
