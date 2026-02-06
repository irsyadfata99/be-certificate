const pool = require("../config/database");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// Login
const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validasi input
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required",
      });
    }

    // Cari user di database
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [
      username,
    ]);

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const user = result.rows[0];

    // Verifikasi password
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Generate JWT token with role
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role, // NEW: Include role in token
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" },
    );

    // Prepare user data for response
    const userData = {
      id: user.id,
      username: user.username,
      role: user.role,
    };

    // Include teacher-specific data if user is teacher
    if (user.role === "teacher") {
      userData.teacher_name = user.teacher_name;
      userData.teacher_division = user.teacher_division;
      userData.teacher_branch = user.teacher_branch;
    }

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: userData,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

module.exports = { login };
