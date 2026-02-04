const express = require("express");
const router = express.Router();
const {
  getAllCertificates,
  getCertificateById,
  createCertificate,
  updateCertificate,
  deleteCertificate,
} = require("../controllers/CertificateController");
const { verifyToken } = require("../auth/AuthMiddleware");

// Semua route certificate dilindungi dengan verifyToken (hanya admin yang bisa akses)
router.get("/", verifyToken, getAllCertificates);
router.get("/:id", verifyToken, getCertificateById);
router.post("/", verifyToken, createCertificate);
router.put("/:id", verifyToken, updateCertificate);
router.delete("/:id", verifyToken, deleteCertificate);

module.exports = router;
