var express = require("express");
var router = express.Router();
const path = require("path");
const multer = require("multer");
const connection = require("../config/connection");
const returnCode = require("../config/responseCode").returnCode;
const UtilController = require("../api/controller/services/UtilController");
const UploadController = require("../api/controller/services/UploadController");
const UserController = require("../api/controller/admin/UserController");
const countryStateCityController = require("../api/controller/services/locationController");

// Configure multer specifically for /api/upload/file
const upload = multer({
  dest: path.join(__dirname, "..", "uploads", "tmp"),
});

router.use(function (req, res, next) {
  //console.log('index router');
  next();
});

router.get("/", (req, res, next) => {
  res.status(200).send("index home page");
});


router.get("/config/aws", (req, res, next) => {
  let responseCode = returnCode.invalidSession;
  let awsCredentials = {};
  if (!UtilController.isEmpty(req.session.userId)) {
    responseCode = returnCode.validSession;
    awsCredentials = connection.aws;
  } else {
    awsCredentials = connection.aws;
  }
  UtilController.sendSuccess(req, res, next, {
    responseCode,
    aws: awsCredentials,
  });
});

router.get("/app/*", (req, res, next) => {
  // res.status(200).send("index home page");
  console.log("build index.html");
  res.sendFile(path.join(__dirname, "build", "index.html"));
});

// File upload endpoint used by the UI
router.post(
  "/upload/file",
  upload.any(),
  (req, res, next) => {
    // Normalize shape so UploadController can use req.files.attachment
    if (Array.isArray(req.files)) {
      const attachmentFiles = req.files.filter(
        (file) => file.fieldname === "attachment",
      );
      if (attachmentFiles.length === 1) {
        req.files = { attachment: attachmentFiles[0] };
      } else if (attachmentFiles.length > 1) {
        req.files = { attachment: attachmentFiles };
      } else {
        req.files = {};
      }
    }
    next();
  },
  UploadController.uploadFile,
);
// State District Sub district
router.route("/state/list").post(UserController.queryAllState);
router.route("/district/list").post(UserController.queryAllDistricts);
// googleApis
router.route("/location/search").get(UtilController.getLocation); //lat and lng for users
router.route("/location/coordinates").get(UtilController.getCoordinates);
router.route("/get/all/countries").post(UtilController.getCountries);
router.route("/get/specific/country/state").post(UtilController.getCountryAndSpecificState);


// fetching country, state, country
router.route("/get/static/location/data").post(countryStateCityController.getCountryStateCity);

//static city state country api
router.route("/get/country").post(countryStateCityController.getStaticCountryName);
router.route("/get/state").post(countryStateCityController.getStaticStatesName);
router.route("/get/city").post(countryStateCityController.getStaticCityNames);


module.exports = router;
