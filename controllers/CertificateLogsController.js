// Certificate Logs Controller

const pool = require("../config/database");

// Helper function to log actions
async function logAction(data) {
  const { certificate_id, action_type, description, from_branch = null, to_branch = null, certificate_amount = 0, medal_amount = 0, old_values = null, new_values = null, performed_by = "System" } = data;

  try {
    await pool.query(
      `INSERT INTO certificate_logs 
       (certificate_id, action_type, description, from_branch, to_branch, 
        certificate_amount, medal_amount, old_values, new_values, performed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [certificate_id, action_type, description, from_branch, to_branch, certificate_amount, medal_amount, old_values ? JSON.stringify(old_values) : null, new_values ? JSON.stringify(new_values) : null, performed_by],
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
    const { certificate_id, action_type, from_date, to_date, search, limit = 100, offset = 0 } = req.query;

    console.log("📥 Fetching logs with filters:", req.query);

    // Validate limit and offset
    const validatedLimit = Math.min(Math.max(parseInt(limit) || 100, 1), 1000);
    const validatedOffset = Math.max(parseInt(offset) || 0, 0);

    let query = "SELECT * FROM certificate_logs WHERE 1=1";
    const params = [];
    let paramCount = 1;

    // Filter by certificate_id
    if (certificate_id && certificate_id.trim()) {
      query += ` AND certificate_id = $${paramCount}`;
      params.push(certificate_id.trim());
      paramCount++;
    }

    // Filter by action_type
    if (action_type && action_type.trim()) {
      query += ` AND action_type = $${paramCount}`;
      params.push(action_type.trim().toUpperCase());
      paramCount++;
    }

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

    // Search in certificate_id or description
    if (search && search.trim()) {
      query += ` AND (certificate_id ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
      params.push(`%${search.trim()}%`);
      paramCount++;
    }

    // Order by most recent first
    query += ` ORDER BY created_at DESC`;

    // Add pagination
    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(validatedLimit, validatedOffset);

    console.log("📝 Query:", query);
    console.log("📝 Params:", params);

    const result = await pool.query(query, params);

    // Get total count for pagination
    let countQuery = "SELECT COUNT(*) FROM certificate_logs WHERE 1=1";
    const countParams = [];
    let countParamNum = 1;

    if (certificate_id && certificate_id.trim()) {
      countQuery += ` AND certificate_id = $${countParamNum}`;
      countParams.push(certificate_id.trim());
      countParamNum++;
    }

    if (action_type && action_type.trim()) {
      countQuery += ` AND action_type = $${countParamNum}`;
      countParams.push(action_type.trim().toUpperCase());
      countParamNum++;
    }

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

    if (search && search.trim()) {
      countQuery += ` AND (certificate_id ILIKE $${countParamNum} OR description ILIKE $${countParamNum})`;
      countParams.push(`%${search.trim()}%`);
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

    if (!id || !id.trim()) {
      return res.status(400).json({
        success: false,
        message: "Certificate ID is required",
      });
    }

    const result = await pool.query("SELECT * FROM certificate_logs WHERE certificate_id = $1 ORDER BY created_at DESC", [id.trim()]);

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
    const { days = 90 } = req.query;

    // Validate days parameter
    const validatedDays = Math.min(Math.max(parseInt(days) || 90, 1), 3650);

    const result = await pool.query(
      `DELETE FROM certificate_logs 
       WHERE created_at < NOW() - INTERVAL '1 day' * $1
       RETURNING id`,
      [validatedDays],
    );

    res.json({
      success: true,
      message: `Deleted ${result.rows.length} log entries older than ${validatedDays} days`,
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
