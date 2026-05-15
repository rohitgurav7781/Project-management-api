const multer = require("multer");
const fs = require("fs");
const path = require("path");

// Ensure upload directory exists and is inside public so files are web-accessible.
const uploadDir = path.join(__dirname, "..", "..", "public", "uploads", "chat");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/jpg",
    // Video
    "video/mp4",
    "video/webm",
    "video/quicktime", // .mov from iPhone etc.
    "video/x-m4v",
    "video/x-msvideo", // .avi
    "video/x-matroska", // .mkv
    "application/pdf",
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/ogg",
    "audio/m4a",
    "audio/aac",
    "audio/webm",
    "audio/x-m4a",
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Unsupported file type"));
  }
};

const upload = multer({
  storage,
  fileFilter,
  // Increase size limit so larger videos can be uploaded (100MB)
  limits: { fileSize: 100 * 1024 * 1024 },
});

module.exports = upload;
