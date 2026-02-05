const express = require("express");
const router = express.Router();
const {
  createCertificate,
  getAllCertificates,
  getCertificateById,
  updateCertificate,
  deleteCertificate,
  migrateCertificate,
} = require("../controllers/CertificateController");
const { verifyToken } = require("../auth/AuthMiddleware");

// Public routes (if you want some endpoints without auth, remove verifyToken)
// Protected routes - all require authentication
router.post("/", verifyToken, createCertificate);
router.get("/", verifyToken, getAllCertificates);
router.get("/:id", verifyToken, getCertificateById);
router.put("/:id", verifyToken, updateCertificate);
router.delete("/:id", verifyToken, deleteCertificate);
router.post("/migrate", verifyToken, migrateCertificate);

module.exports = router;
