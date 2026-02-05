// Certificate Logs Controller
// Add this to a new file: controllers/CertificateLogsController.js

const pool = require("../config/database");

// Helper function to log actions
async function logAction(data) {
  const {
    certificate_id,
    action_type,
    description,
    from_branch = null,
    to_branch = null,
    certificate_amount = 0,
    medal_amount = 0,
    old_values = null,
    new_values = null,
    performed_by = "System",
  } = data;

  try {
    await pool.query(
      `INSERT INTO certificate_logs 
       (certificate_id, action_type, description, from_branch, to_branch, 
        certificate_amount, medal_amount, old_values, new_values, performed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        certificate_id,
        action_type,
        description,
        from_branch,
        to_branch,
        certificate_amount,
        medal_amount,
        old_values ? JSON.stringify(old_values) : null,
        new_values ? JSON.stringify(new_values) : null,
        performed_by,
      ],
    );
    console.log("📝 Log created:", action_type, certificate_id);
  } catch (error) {
    console.error("❌ Failed to create log:", error);
    // Don't throw error - logging shouldn't break the main operation
  }
}

// Get all logs with optional filtering
const getLogs = async (req, res) => {
  try {
    const {
      certificate_id,
      action_type,
      from_date,
      to_date,
      search,
      limit = 100,
      offset = 0,
    } = req.query;

    console.log("📥 Fetching logs with filters:", req.query);

    let query = "SELECT * FROM certificate_logs WHERE 1=1";
    const params = [];
    let paramCount = 1;

    // Filter by certificate_id
    if (certificate_id) {
      query += ` AND certificate_id = $${paramCount}`;
      params.push(certificate_id);
      paramCount++;
    }

    // Filter by action_type
    if (action_type) {
      query += ` AND action_type = $${paramCount}`;
      params.push(action_type);
      paramCount++;
    }

    // Filter by date range
    if (from_date) {
      query += ` AND created_at >= $${paramCount}`;
      params.push(from_date);
      paramCount++;
    }

    if (to_date) {
      query += ` AND created_at <= $${paramCount}`;
      params.push(to_date + " 23:59:59"); // Include the entire day
      paramCount++;
    }

    // Search in certificate_id or description
    if (search) {
      query += ` AND (certificate_id ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    // Order by most recent first
    query += ` ORDER BY created_at DESC`;

    // Add pagination
    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    console.log("📝 Query:", query);
    console.log("📝 Params:", params);

    const result = await pool.query(query, params);

    // Get total count for pagination
    let countQuery = "SELECT COUNT(*) FROM certificate_logs WHERE 1=1";
    const countParams = [];
    let countParamNum = 1;

    if (certificate_id) {
      countQuery += ` AND certificate_id = $${countParamNum}`;
      countParams.push(certificate_id);
      countParamNum++;
    }

    if (action_type) {
      countQuery += ` AND action_type = $${countParamNum}`;
      countParams.push(action_type);
      countParamNum++;
    }

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

    if (search) {
      countQuery += ` AND (certificate_id ILIKE $${countParamNum} OR description ILIKE $${countParamNum})`;
      countParams.push(`%${search}%`);
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
    console.error("Get logs error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Get logs for a specific certificate
const getLogsByCertificate = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "SELECT * FROM certificate_logs WHERE certificate_id = $1 ORDER BY created_at DESC",
      [id],
    );

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error("Get certificate logs error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Delete old logs (cleanup function)
const deleteOldLogs = async (req, res) => {
  try {
    const { days = 90 } = req.query; // Default: delete logs older than 90 days

    const result = await pool.query(
      `DELETE FROM certificate_logs 
       WHERE created_at < NOW() - INTERVAL '${days} days'
       RETURNING id`,
    );

    res.json({
      success: true,
      message: `Deleted ${result.rows.length} old log entries`,
      deletedCount: result.rows.length,
    });
  } catch (error) {
    console.error("Delete old logs error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

module.exports = {
  logAction,
  getLogs,
  getLogsByCertificate,
  deleteOldLogs,
};
