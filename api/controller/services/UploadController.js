const express = require("express");
const fs = require("fs");
const path = require("path");
const UtilController = require("./UtilController");

module.exports = {
  uploadFile: (req, res) => {
    try {
      if (!req.files) {
        return res.status(400).json({ error: "No files were uploaded." });
      }

      const folderName = req.body.folderName || "uploads";
      const uploadDir =
        process.env.NODE_ENV === "production"
          ? path.join("/home/ec2-user/usica_server/uploads", folderName)
          : path.join(__dirname, "../../../public/uploads", folderName);

      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      const uploadedFiles = req.files.attachment;
      const fileArray = Array.isArray(uploadedFiles) ? uploadedFiles : [uploadedFiles];

      const fileLinks = [];
      fileArray.forEach(file => {
        const uniqueSuffix = Math.floor(Date.now() * 1000);
        const newFileName = uniqueSuffix + "-" + file.originalname;
        const newPath = path.join(uploadDir, newFileName);

        fs.copyFileSync(file.path, newPath);
        fs.unlinkSync(file.path);

        const fileUrl = `${req.protocol}://${req.get("host")}/public/uploads/${folderName}/${newFileName}`;
        fileLinks.push(fileUrl);
      });

      res.status(200).json({ message: "File(s) uploaded successfully!", links: fileLinks });
    } catch (error) {
      res.status(500).json({ error: "Server error during file upload.", error });
    }
  },

  uploadFile_notInReq: (req, excel, status, fileName) => {
    try {
      if (!excel) {
        return [];
      }

      const folderName = req.body?.folderName || status;
      const uploadDir =
        process.env.NODE_ENV === "production"
          ? path.join("/home/ec2-user/usica_server/uploads", folderName)
          : path.join(__dirname, "../../../public/uploads", folderName);

      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const fileArray = Array.isArray(excel) ? excel : [excel];
      const fileLinks = [];

      fileArray.forEach(file => {
        const newFileName = fileName;
        const newPath = path.join(uploadDir, newFileName);

        fs.writeFileSync(newPath, file);

        const fileUrl = `${req.protocol}://${req.get("host")}/public/uploads/${folderName}/${newFileName}`;
        fileLinks.push(fileUrl);
      });

      return fileLinks;
    } catch (error) {
      console.error("Error during file upload:", error);
      return [];
    }
  },

  testUpload: (req, res) => {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).send("No files were uploaded.");
    }

    let uploadedFile = req.files.file;
    const uploadPath =
      process.env.NODE_ENV === "production"
        ? path.join("/home/ec2-user/usica_server/uploads", uploadedFile.name)
        : path.join(__dirname, "uploads", uploadedFile.name);

    uploadedFile.mv(uploadPath, function (err) {
      if (err) {
        return res.status(500).send(err);
      }

      res.send("File uploaded successfully!");
    });
  },

  uploadFile_inReq: (req, folderName) => {
    try {
      if (!req.files || !req.files.attachment) {
        throw new Error("No files were uploaded.");
      }

      const uploadedFiles = req.files.attachment;
      const fileArray = Array.isArray(uploadedFiles) ? uploadedFiles : [uploadedFiles];
      const uploadDir =
        process.env.NODE_ENV === "production"
          ? path.join("/home/ec2-user/usica_server/uploads", folderName)
          : path.join(__dirname, "../../../public/uploads", folderName);

      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const fileLinks = [];
      let newPath = "";

      for (const file of fileArray) {
        const uniqueSuffix = Math.floor(Date.now() * 1000);
        const newFileName = `${uniqueSuffix}-${file.originalname}`;
        newPath = path.join(uploadDir, newFileName);

        fs.copyFileSync(file.path, newPath);
        fs.unlinkSync(file.path);

        const fileUrl = `${req.protocol}://${req.get("host")}/public/uploads/${folderName}/${newFileName}`;
        fileLinks.push(fileUrl);
      }

      return { fileLinks, newPath };
    } catch (error) {
      console.error("Error during file upload:", error.message);
      throw error;
    }
  },
};
