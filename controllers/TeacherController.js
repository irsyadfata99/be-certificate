// Teacher Controller
// Handles CRUD operations for teachers

const pool = require("../config/database");
const bcrypt = require("bcrypt");
const { generatePassword } = require("../utils/passwordGenerator");

// =====================================================
// HELPER FUNCTIONS
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

// Validation helpers
function validateTeacherName(name) {
  if (!name || !name.trim()) {
    return { valid: false, error: "Teacher name is required" };
  }

  const cleanName = name.trim();

  if (cleanName.length < 3) {
    return {
      valid: false,
      error: "Teacher name must be at least 3 characters",
    };
  }

  if (cleanName.length > 100) {
    return {
      valid: false,
      error: "Teacher name must not exceed 100 characters",
    };
  }

  return { valid: true, value: cleanName };
}

function validateUsername(username) {
  if (!username || !username.trim()) {
    return { valid: false, error: "Username is required" };
  }

  const cleanUsername = username.trim();

  if (cleanUsername.length < 3) {
    return { valid: false, error: "Username must be at least 3 characters" };
  }

  if (cleanUsername.length > 50) {
    return { valid: false, error: "Username must not exceed 50 characters" };
  }

  const validFormat = /^[A-Za-z0-9_]+$/;
  if (!validFormat.test(cleanUsername)) {
    return {
      valid: false,
      error: "Username can only contain letters, numbers, and underscores",
    };
  }

  return { valid: true, value: cleanUsername };
}

function validateDivision(division) {
  if (!division || !division.trim()) {
    return { valid: false, error: "Teacher division is required" };
  }

  const cleanDivision = division.trim().toUpperCase();

  if (!["JK", "LK"].includes(cleanDivision)) {
    return { valid: false, error: "Division must be either JK or LK" };
  }

  return { valid: true, value: cleanDivision };
}

function validateBranch(branch) {
  if (!branch || !branch.trim()) {
    return { valid: false, error: "Teacher branch is required" };
  }

  const cleanBranch = branch.trim().toUpperCase();

  if (!["SND", "MKW", "KBP"].includes(cleanBranch)) {
    return { valid: false, error: "Branch must be SND, MKW, or KBP" };
  }

  return { valid: true, value: cleanBranch };
}

// =====================================================
// 1. CREATE TEACHER
// =====================================================
const createTeacher = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    console.log("📥 Create teacher request:", req.body);

    const { teacher_name, teacher_division, teacher_branch, username } =
      req.body;

    // Validate teacher_name
    const nameValidation = validateTeacherName(teacher_name);
    if (!nameValidation.valid) {
      await client.query("ROLLBACK");
      return sendError(res, 400, nameValidation.error);
    }

    // Validate username
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      await client.query("ROLLBACK");
      return sendError(res, 400, usernameValidation.error);
    }

    // Validate division
    const divisionValidation = validateDivision(teacher_division);
    if (!divisionValidation.valid) {
      await client.query("ROLLBACK");
      return sendError(res, 400, divisionValidation.error);
    }

    // Validate branch
    const branchValidation = validateBranch(teacher_branch);
    if (!branchValidation.valid) {
      await client.query("ROLLBACK");
      return sendError(res, 400, branchValidation.error);
    }

    const cleanName = nameValidation.value;
    const cleanUsername = usernameValidation.value;
    const cleanDivision = divisionValidation.value;
    const cleanBranch = branchValidation.value;

    // Check if username already exists
    const checkExisting = await client.query(
      "SELECT * FROM users WHERE username = $1",
      [cleanUsername],
    );

    if (checkExisting.rows.length > 0) {
      await client.query("ROLLBACK");
      return sendError(res, 409, "Username already exists");
    }

    // Generate random password
    const generatedPassword = generatePassword(12);
    console.log("🔑 Generated password:", generatedPassword);

    // Hash password
    const hashedPassword = await bcrypt.hash(generatedPassword, 10);

    // Insert teacher
    const result = await client.query(
      `INSERT INTO users 
       (username, password, default_password, role, teacher_name, teacher_division, teacher_branch) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING id, username, teacher_name, teacher_division, teacher_branch, default_password, created_at`,
      [
        cleanUsername,
        hashedPassword,
        generatedPassword, // Store plaintext for one-time display
        "teacher",
        cleanName,
        cleanDivision,
        cleanBranch,
      ],
    );

    await client.query("COMMIT");

    console.log("✅ Teacher created:", result.rows[0]);

    return sendSuccess(res, "Teacher created successfully", result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    return sendError(res, 500, "Failed to create teacher", error);
  } finally {
    client.release();
  }
};

// =====================================================
// 2. GET ALL TEACHERS (WITH PAGINATION)
// =====================================================
const getAllTeachers = async (req, res) => {
  try {
    const { limit = 5, offset = 0 } = req.query;

    const validatedLimit = Math.min(Math.max(parseInt(limit) || 5, 1), 100);
    const validatedOffset = Math.max(parseInt(offset) || 0, 0);

    console.log(
      `📥 Get teachers: limit=${validatedLimit}, offset=${validatedOffset}`,
    );

    // Get paginated teachers
    const query = `
      SELECT 
        id, username, teacher_name, teacher_division, teacher_branch, 
        default_password, created_at, updated_at
      FROM users
      WHERE role = 'teacher'
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await pool.query(query, [validatedLimit, validatedOffset]);

    // Get total count
    const countResult = await pool.query(
      "SELECT COUNT(*) FROM users WHERE role = 'teacher'",
    );
    const totalCount = parseInt(countResult.rows[0].count);

    const pagination = {
      total: totalCount,
      limit: validatedLimit,
      offset: validatedOffset,
      hasMore: totalCount > validatedOffset + result.rows.length,
      currentPage: Math.floor(validatedOffset / validatedLimit) + 1,
      totalPages: Math.ceil(totalCount / validatedLimit),
    };

    console.log(`✅ Returned ${result.rows.length}/${totalCount} teachers`);

    return sendSuccess(res, "Teachers retrieved successfully", result.rows, {
      pagination,
      count: result.rows.length,
    });
  } catch (error) {
    return sendError(res, 500, "Failed to retrieve teachers", error);
  }
};

// =====================================================
// 3. GET TEACHER BY ID
// =====================================================
const getTeacherById = async (req, res) => {
  try {
    const { id } = req.params;

    const teacherId = parseInt(id);
    if (isNaN(teacherId)) {
      return sendError(res, 400, "Invalid teacher ID");
    }

    const result = await pool.query(
      `SELECT 
        id, username, teacher_name, teacher_division, teacher_branch, 
        default_password, created_at, updated_at
      FROM users 
      WHERE id = $1 AND role = 'teacher'`,
      [teacherId],
    );

    if (result.rows.length === 0) {
      return sendError(res, 404, "Teacher not found");
    }

    return sendSuccess(res, "Teacher retrieved successfully", result.rows[0]);
  } catch (error) {
    return sendError(res, 500, "Failed to retrieve teacher", error);
  }
};

// =====================================================
// 4. UPDATE TEACHER
// =====================================================
const updateTeacher = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { id } = req.params;
    const {
      teacher_name,
      teacher_division,
      teacher_branch,
      username,
      new_password,
    } = req.body;

    const teacherId = parseInt(id);
    if (isNaN(teacherId)) {
      await client.query("ROLLBACK");
      return sendError(res, 400, "Invalid teacher ID");
    }

    console.log("📝 Update teacher request:", { id: teacherId, ...req.body });

    // Check if teacher exists
    const checkTeacher = await client.query(
      "SELECT * FROM users WHERE id = $1 AND role = 'teacher'",
      [teacherId],
    );

    if (checkTeacher.rows.length === 0) {
      await client.query("ROLLBACK");
      return sendError(res, 404, "Teacher not found");
    }

    const currentTeacher = checkTeacher.rows[0];

    // Validate fields if provided
    let cleanName = currentTeacher.teacher_name;
    if (teacher_name !== undefined) {
      const nameValidation = validateTeacherName(teacher_name);
      if (!nameValidation.valid) {
        await client.query("ROLLBACK");
        return sendError(res, 400, nameValidation.error);
      }
      cleanName = nameValidation.value;
    }

    let cleanUsername = currentTeacher.username;
    if (username !== undefined) {
      const usernameValidation = validateUsername(username);
      if (!usernameValidation.valid) {
        await client.query("ROLLBACK");
        return sendError(res, 400, usernameValidation.error);
      }
      cleanUsername = usernameValidation.value;

      // Check if new username already exists (for other users)
      if (cleanUsername !== currentTeacher.username) {
        const checkExisting = await client.query(
          "SELECT * FROM users WHERE username = $1 AND id != $2",
          [cleanUsername, teacherId],
        );

        if (checkExisting.rows.length > 0) {
          await client.query("ROLLBACK");
          return sendError(res, 409, "Username already exists");
        }
      }
    }

    let cleanDivision = currentTeacher.teacher_division;
    if (teacher_division !== undefined) {
      const divisionValidation = validateDivision(teacher_division);
      if (!divisionValidation.valid) {
        await client.query("ROLLBACK");
        return sendError(res, 400, divisionValidation.error);
      }
      cleanDivision = divisionValidation.value;
    }

    let cleanBranch = currentTeacher.teacher_branch;
    if (teacher_branch !== undefined) {
      const branchValidation = validateBranch(teacher_branch);
      if (!branchValidation.valid) {
        await client.query("ROLLBACK");
        return sendError(res, 400, branchValidation.error);
      }
      cleanBranch = branchValidation.value;
    }

    // Handle password update
    let hashedPassword = currentTeacher.password;
    let newDefaultPassword = currentTeacher.default_password;

    if (new_password && new_password.trim()) {
      if (new_password.length < 8) {
        await client.query("ROLLBACK");
        return sendError(res, 400, "Password must be at least 8 characters");
      }
      hashedPassword = await bcrypt.hash(new_password, 10);
      newDefaultPassword = new_password; // Update default password if manually changed
    }

    // Update teacher
    const result = await client.query(
      `UPDATE users 
       SET username = $1, 
           teacher_name = $2, 
           teacher_division = $3, 
           teacher_branch = $4,
           password = $5,
           default_password = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING id, username, teacher_name, teacher_division, teacher_branch, default_password, created_at, updated_at`,
      [
        cleanUsername,
        cleanName,
        cleanDivision,
        cleanBranch,
        hashedPassword,
        newDefaultPassword,
        teacherId,
      ],
    );

    await client.query("COMMIT");

    console.log("✅ Teacher updated:", result.rows[0]);

    return sendSuccess(res, "Teacher updated successfully", result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    return sendError(res, 500, "Failed to update teacher", error);
  } finally {
    client.release();
  }
};

// =====================================================
// 5. DELETE TEACHER
// =====================================================
const deleteTeacher = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { id } = req.params;

    const teacherId = parseInt(id);
    if (isNaN(teacherId)) {
      await client.query("ROLLBACK");
      return sendError(res, 400, "Invalid teacher ID");
    }

    console.log("🗑️ Delete teacher request:", teacherId);

    // Check if teacher exists
    const checkTeacher = await client.query(
      "SELECT * FROM users WHERE id = $1 AND role = 'teacher'",
      [teacherId],
    );

    if (checkTeacher.rows.length === 0) {
      await client.query("ROLLBACK");
      return sendError(res, 404, "Teacher not found");
    }

    const teacher = checkTeacher.rows[0];

    // Delete teacher
    await client.query("DELETE FROM users WHERE id = $1", [teacherId]);

    await client.query("COMMIT");

    console.log("✅ Teacher deleted:", teacher.username);

    return sendSuccess(res, "Teacher deleted successfully", {
      id: teacher.id,
      username: teacher.username,
      teacher_name: teacher.teacher_name,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return sendError(res, 500, "Failed to delete teacher", error);
  } finally {
    client.release();
  }
};

module.exports = {
  createTeacher,
  getAllTeachers,
  getTeacherById,
  updateTeacher,
  deleteTeacher,
};
