const pool = require("../config/database");
const { logAction } = require("./CertificateLogsController");

// Create new certificate entry
const createCertificate = async (req, res) => {
  try {
    console.log("📥 Received request body:", req.body);

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

    console.log("✅ Certificate created:", result.rows[0]);

    res.status(201).json({
      success: true,
      message: "Certificate created successfully",
      data: result.rows[0],
    });

    await logAction({
      certificate_id: certificate_id,
      action_type: "CREATE",
      description: `Created new certificate batch with SND: ${sert_snd} certs, ${medal_snd} medals | MKW: ${sert_mkw} certs, ${medal_mkw} medals | KBP: ${sert_kbp} certs, ${medal_kbp} medals`,
      new_values: result.rows[0],
      performed_by: req.user?.username || "System",
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

    console.log("📥 Update request body:", req.body);
    console.log("📌 Certificate ID:", id);

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
    console.log("📋 Current data:", current);

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

    console.log("📊 New values:", {
      sert_kbp,
      medal_kbp,
      sert_snd,
      medal_snd,
      sert_mkw,
      medal_mkw,
    });

    // Update certificate - FIXED: Don't update medali_awal_* fields
    // medali_awal_* should only be set during creation and remain unchanged
    const result = await pool.query(
      `UPDATE certificates 
       SET jumlah_sertifikat_kbp = $1, jumlah_medali_kbp = $2,
           jumlah_sertifikat_snd = $3, jumlah_medali_snd = $4,
           jumlah_sertifikat_mkw = $5, jumlah_medali_mkw = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE certificate_id = $7
       RETURNING *`,
      [sert_kbp, medal_kbp, sert_snd, medal_snd, sert_mkw, medal_mkw, id],
    );

    console.log("✅ Certificate updated:", result.rows[0]);

    res.json({
      success: true,
      message: "Certificate updated successfully",
      data: result.rows[0],
    });

    await logAction({
      certificate_id: id,
      action_type: "UPDATE",
      description: `Updated certificate batch. Changes: ${
        sert_kbp !== current.jumlah_sertifikat_kbp
          ? `KBP certs ${current.jumlah_sertifikat_kbp}→${sert_kbp} `
          : ""
      }${
        medal_kbp !== current.jumlah_medali_kbp
          ? `KBP medals ${current.jumlah_medali_kbp}→${medal_kbp} `
          : ""
      }${
        sert_snd !== current.jumlah_sertifikat_snd
          ? `SND certs ${current.jumlah_sertifikat_snd}→${sert_snd} `
          : ""
      }${
        medal_snd !== current.jumlah_medali_snd
          ? `SND medals ${current.jumlah_medali_snd}→${medal_snd} `
          : ""
      }${
        sert_mkw !== current.jumlah_sertifikat_mkw
          ? `MKW certs ${current.jumlah_sertifikat_mkw}→${sert_mkw} `
          : ""
      }${
        medal_mkw !== current.jumlah_medali_mkw
          ? `MKW medals ${current.jumlah_medali_mkw}→${medal_mkw} `
          : ""
      }`.trim(),
      old_values: current,
      new_values: result.rows[0],
      performed_by: req.user?.username || "System",
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

    await logAction({
      certificate_id: certificate_id,
      action_type: "MIGRATE",
      description: `Migrated ${migrationItems.join(" and ")} from SND to ${destination_branch.toUpperCase()}`,
      from_branch: "snd",
      to_branch: destination_branch,
      certificate_amount: certAmount,
      medal_amount: medalAmount,
      old_values: {
        snd_certs: certificate.jumlah_sertifikat_snd,
        snd_medals: certificate.jumlah_medali_snd,
        dest_certs:
          destination_branch === "mkw"
            ? certificate.jumlah_sertifikat_mkw
            : certificate.jumlah_sertifikat_kbp,
        dest_medals:
          destination_branch === "mkw"
            ? certificate.jumlah_medali_mkw
            : certificate.jumlah_medali_kbp,
      },
      new_values: {
        snd_certs: newSndCert,
        snd_medals: newSndMedal,
        dest_certs: newDestCert,
        dest_medals: newDestMedal,
      },
      performed_by: req.user?.username || "System",
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
    console.log("🔄 Migrate request body:", req.body);

    const {
      certificate_id,
      destination_branch,
      certificate_amount,
      medal_amount,
    } = req.body;

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
        message:
          "At least one amount (certificates or medals) must be greater than 0",
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
    console.log("📋 Current certificate data:", certificate);

    // Check stock availability for certificates
    if (certAmount > 0 && certificate.jumlah_sertifikat_snd < certAmount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient SND certificate stock. Available: ${certificate.jumlah_sertifikat_snd}, Requested: ${certAmount}`,
      });
    }

    // Check stock availability for medals
    if (medalAmount > 0 && certificate.jumlah_medali_snd < medalAmount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient SND medal stock. Available: ${certificate.jumlah_medali_snd}, Requested: ${medalAmount}`,
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
    const destCertField =
      destination_branch === "mkw"
        ? "jumlah_sertifikat_mkw"
        : "jumlah_sertifikat_kbp";
    const destMedalField =
      destination_branch === "mkw" ? "jumlah_medali_mkw" : "jumlah_medali_kbp";

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

    console.log("📝 Update query params:", [
      newSndCert,
      newSndMedal,
      newDestCert,
      newDestMedal,
      certificate_id,
    ]);

    // Execute migration
    const result = await pool.query(updateQuery, [
      newSndCert,
      newSndMedal,
      newDestCert,
      newDestMedal,
      certificate_id,
    ]);

    console.log("✅ Migration successful:", result.rows[0]);

    // Build migration summary message
    const migrationItems = [];
    if (certAmount > 0) migrationItems.push(`${certAmount} certificate(s)`);
    if (medalAmount > 0) migrationItems.push(`${medalAmount} medal(s)`);

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
          previous_dest:
            destination_branch === "mkw"
              ? certificate.jumlah_sertifikat_mkw
              : certificate.jumlah_sertifikat_kbp,
          new_dest: newDestCert,
        },
        medals: {
          amount: medalAmount,
          previous_snd: certificate.jumlah_medali_snd,
          new_snd: newSndMedal,
          previous_dest:
            destination_branch === "mkw"
              ? certificate.jumlah_medali_mkw
              : certificate.jumlah_medali_kbp,
          new_dest: newDestMedal,
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

// Make sure to export it
module.exports = {
  createCertificate,
  getAllCertificates,
  getCertificateById,
  updateCertificate,
  deleteCertificate,
  migrateCertificate, // This updated version
};
