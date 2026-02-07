// routes/teacherRoutes.js
// Handles all teacher-related endpoints (admin only)

const express = require("express");
const router = express.Router();
const {
  createTeacher,
  getAllTeachers,
  getTeacherById,
  updateTeacher,
  deleteTeacher,
} = require("../controllers/TeacherController");
const { verifyToken, requireAdmin } = require("../auth/AuthMiddleware");

// =====================================================
// ALL ROUTES REQUIRE AUTHENTICATION AND ADMIN ROLE
// =====================================================
router.use(verifyToken);
router.use(requireAdmin);

// =====================================================
// TEACHER CRUD OPERATIONS
// =====================================================

// Create new teacher (generates random password)
router.post("/", createTeacher);

// Get all teachers (with pagination)
router.get("/", getAllTeachers);

// Get specific teacher by ID
router.get("/:id", getTeacherById);

// Update teacher (can update all fields including password)
router.put("/:id", updateTeacher);

// Delete teacher
router.delete("/:id", deleteTeacher);

module.exports = router;
