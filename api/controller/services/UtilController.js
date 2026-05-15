let request = require("request");
let mongoose = require("mongoose");
var CryptoJS = require("crypto-js");
const responseCode = require("../../../config/responseCode").returnCode;
const User = require("../../models/User");
const AwsController = require("./AwsController");
const awsConfig = require("../../../config/connection");
const path = require("path");
var link = awsConfig.aws.link;
const axios = require("axios");
const Setting = require("../../models/Setting");
const configuration = require("../../../config/configuration");
const connection = require("../../../config/connection");
module.exports = {
  sendSuccess: async (req, res, next, data) => {
    if (module.exports.isEmpty(data?.responseCode)) {
      data["responseCode"] = responseCode.validSession;
    }
    res.status(200).send({
      message: "success",
      code: responseCode.success,
      data: data,
    });
  },
  decryptData: (passwordHash, secretKey) => {
    try {
      let bytes = CryptoJS.AES.decrypt(passwordHash, secretKey);
      let decrypted = bytes.toString(CryptoJS.enc.Utf8);
      return decrypted;
    } catch (error) {
      console.log("error in payload dencryption---", error);
      return null;
    }
  },
  sendError: async (req, res, next, err) => {
    console.error(err);
    res.status(500).send({
      message: err?.message || "failure",
      code: responseCode.errror,
      data: err,
    });
  },
  isEmpty: data => {
    let returnObj = false;
    if (typeof data === "undefined" || data === null || data === "" || data === "" || data.length === 0) {
      returnObj = true;
    }
    return returnObj;
  },

  uploadFilesToStorage: async function (bucketParam, req, res, next) {
    try {
      const attachmentUrlArray = [];
      if (!(req.files === null || req.files === undefined) && !(req.files.attachment === undefined)) {
        const bucket = bucketParam;
        const attachmentObj = req.files.attachment;

        if (Array.isArray(attachmentObj)) {
          for (const attachment of attachmentObj) {
            const attachmentName = Date.now() + "_" + attachment.originalname;

            const originalDir = path.dirname(attachment.path);
            const newFilePath = path.join(originalDir, attachmentName);

            attachmentUrlArray.push(newFilePath);

            await AwsController.upload2LocalStorage(attachment.path, bucket, attachmentName, attachment.mimetype);
          }
        } else {
          const attachmentPath = attachmentObj.path;
          const attachmentName = Date.now() + "_" + attachmentObj.originalname;

          const originalDir = path.dirname(attachmentPath);
          const newFilePath = path.join(originalDir, attachmentName);

          attachmentUrlArray.push(newFilePath);

          await AwsController.upload2LocalStorage(attachmentPath, bucket, attachmentName, attachmentObj.mimetype);
        }
      }

      return attachmentUrlArray;
    } catch (err) {
      console.error(err);
      return [];
    }
  },

  checkEmailStatus: userObj => {
    let userCode = responseCode.accountSuspended; // user account is suspended/ deactivated, needs to check with admin team
    try {
      if (!module.exports.isEmpty(userObj)) {
        if (!userObj.emailVerified) {
          userCode = responseCode.notVerifiedEmail; // success, email id is valid
        }
        if (userObj.active && userCode === responseCode.accountSuspended) {
          userCode = responseCode.validEmail; // success, email id is valid
        }
        if (userObj.passwordAttempt > 2) {
          userCode = responseCode.exceededpasswordAttempt; // success, email id is valid
        }
      } else {
        userCode = responseCode.emailNotFound; // email id is not there, wrong email address, records not found in DB
      }
    } catch (err) {
      console.error(err);
      userCode = responseCode.userException;
    } finally {
      return userCode;
    }
  },
  comparePassword: (passwordHash, userPassword, secretKey) => {
    let returnObj = responseCode.passwordMismatch;
    try {
      // Decrypt
      let bytes = CryptoJS.AES.decrypt(passwordHash, secretKey);
      let decryptedPwd = bytes.toString(CryptoJS.enc.Utf8);
      console.log("decryptedPwd", decryptedPwd);
      if (decryptedPwd === userPassword) {
        returnObj = responseCode.passwordMatched;
      }
    } catch (err) {
      console.error(err);
      returnObj = responseCode.userException;
    } finally {
      return returnObj;
    }
  },
  getOTP: userObj => {
    console.log("getOTP");
    let otpVal = 0;
    try {
      let numberArr = [8948080894, 7989527468, 7307134521, 9100766889, 9566593919, 8686200686];
      let isNumPresent = numberArr.includes(Number(userObj.mobileNo));
      if (isNumPresent) {
        otpVal = "135799";
      } else {
        // otpVal = Math.floor(Math.random() * (999999 - 100000)) + 100000;
        otpVal = "135799";
      }
      // otpVal = "135799"; // this is temparoty solution, once integrate sms gateway, need to remove this one
    } catch (err) {
      console.error(err);
    }
    console.log("return otp= " + otpVal);
    return otpVal;
  },
  uploadFiles: async function (req, res, next) {
    try {
      const attachmentUrlArray = [];
      const bucket = awsConfig.aws.bucket + "/" + req.body.bucketName;
      const isPrivate = req.body.isPrivate === "true";

      if (req.files && req.files.attachment) {
        const attachmentObj = req.files.attachment;

        if (Array.isArray(attachmentObj)) {
          // Handle multiple files
          const uploadPromises = attachmentObj.map(async file => {
            const attachmentName = Date.now() + "_" + file.originalname;
            const attachmentUrl = link.concat(bucket + "/" + encodeURIComponent(attachmentName));
            attachmentUrlArray.push(attachmentUrl);

            await AwsController.upload2AWS(file.path, bucket, attachmentName, file.mimetype);
          });

          await Promise.all(uploadPromises);

          if (isPrivate) {
            const data = {
              attachmentName: attachmentObj[0].originalname, // or adjust based on needs
              attachmentUrl: attachmentUrlArray[0],
            };
            module.exports.saveFile(req, res, next, data);
          } else {
            module.exports.sendSuccess(req, res, next, {
              attachmentUrl: attachmentUrlArray,
            });
          }
        } else {
          // Handle single file
          const file = attachmentObj;
          const attachmentName = Date.now() + "_" + file.originalname;
          const attachmentUrl = link.concat(bucket + "/" + encodeURIComponent(attachmentName));
          attachmentUrlArray.push(attachmentUrl);

          await AwsController.upload2AWS(file.path, bucket, attachmentName, file.mimetype);

          if (isPrivate) {
            const data = {
              attachmentName,
              attachmentUrl: attachmentUrlArray[0],
            };
            module.exports.saveFile(req, res, next, data);
          } else {
            module.exports.sendSuccess(req, res, next, {
              attachmentUrl: attachmentUrlArray,
            });
          }
        }
      } else {
        // Handle the case where no files are provided
        module.exports.sendError(req, res, next, new Error("No files uploaded"));
      }
    } catch (err) {
      console.error(err);
      module.exports.sendError(req, res, next, err);
    }
  },
  uploadInvoiceFiles: async function (pdfData, pdfPath) {
    try {
      //var attachmentUrl = "";
      var attachmentUrlArray = [];
      var attachmentName;
      var code = 1;
      if (pdfData) {
        // to get the bucket name based on input condition, starts Here
        var bucket = awsConfig.aws.bucket;

        // ends here
        var attachmentObj = pdfData;
        var attachmentPath = pdfPath;
        attachmentName = Date.now() + "_" + "attachment";
        //  attachmentUrl = link.concat(bucket + '/' + attachmentName);
        attachmentUrlArray.push(link.concat(bucket + "/" + encodeURIComponent(attachmentName)));
        await AwsController.upload2AWS(attachmentPath, bucket, attachmentName, "application/pdf"); // this is async call, will not wait until to finish upload

        return attachmentUrlArray;
      }
    } catch (err) {
      console.error(err);
      module.exports.sendError(req, res, next, err);
    }
  },

  uploadFileWithReturn: async function (bucketParam, req, res, next) {
    try {
      //var attachmentUrl = "";
      var attachmentUrlArray = [];
      var code = 1;
      if (!(req.files === null || req.files === undefined)) {
        // to get the bucket name based on input condition, starts Here
        var bucket = bucketParam;
        // var bucket = awsConfig.aws.inventoryImageBucket;

        // ends here
        var attachmentObj = Object.values(req.files);
        if (Array.isArray(attachmentObj)) {
          for (var i = 0; i < attachmentObj.length; i++) {
            var attachmentName = Date.now() + "_" + attachmentObj[i].originalname;
            attachmentUrlArray.push(link.concat(bucket + "/" + encodeURIComponent(attachmentName)));
            await AwsController.upload2AWS(attachmentObj[i].path, bucket, attachmentName, attachmentObj[i].mimetype); // this is async call, will not wait until to finish upload
          }
        } else {
          var attachmentPath = attachmentObj.path;
          var attachmentName = Date.now() + "_" + attachmentObj.originalname;
          //  attachmentUrl = link.concat(bucket + '/' + attachmentName);
          attachmentUrlArray.push(link.concat(bucket + "/" + encodeURIComponent(attachmentName)));
          await AwsController.upload2AWS(attachmentPath, bucket, attachmentName, attachmentObj.mimetype); // this is async call, will not wait until to finish upload
        }
      }
      return attachmentUrlArray;
      // module.exports.sendSuccess(req, res, next, {
      //   attachmentUrl: attachmentUrlArray,
      // });
    } catch (err) {
      console.error(err);
      module.exports.sendError(req, res, next, err);
    }
  },
  pad: (num, size) => {
    var s = num + "";
    while (s.length < size) s = "0" + s;
    return s;
  },

  generateUniqueNumber: length => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";

    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return result;
  },

  generateRandomNumber: length => {
    const chars = "123456789";
    let result = "";

    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return result;
  },

  getHourAndMinuteFromMillisecond: differenceMsec => {
    var hour = Math.floor(differenceMsec / 1000 / 60 / 60);
    differenceMsec -= hour * 1000 * 60 * 60;
    var minute = Math.floor(differenceMsec / 1000 / 60);
    differenceMsec -= minute * 1000 * 60;
    var second = Math.floor(differenceMsec / 1000);
    differenceMsec -= second * 1000;
    return {
      hour,
      minute,
      second,
    };
  },

  hasCrossed10PMTo6AM: (dateTime1, dateTime2) => {
    const tenPM = new Date(dateTime1);
    tenPM.setHours(22, 0, 0, 0); // 10:00 PM

    const sixAM = new Date(dateTime1);
    sixAM.setHours(6, 0, 0, 0); // 6:00 AM (next day)

    if (dateTime1 > tenPM || dateTime2 > tenPM) {
      return true;
    } else if (dateTime1 < sixAM || dateTime2 < sixAM) {
      return true;
    } else {
      return false;
    }
  },

  getStartAndEndOfMoth: currentDate => {
    // Get the start of the month
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);

    // Get the end of the month
    const nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    const endOfMonth = new Date(nextMonth - 1);

    return {
      startOfMonth: startOfMonth / 1000,
      endOfMonth: endOfMonth / 1000,
    };
  },

  getStartAndEndOfTheWeek: currentDate => {
    // Calculate the day of the week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
    const dayOfWeek = currentDate.getDay();

    // Calculate the start of the week (Sunday)
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - dayOfWeek);

    // Calculate the end of the week (Saturday)
    const endOfWeek = new Date(currentDate);
    endOfWeek.setDate(currentDate.getDate() + (6 - dayOfWeek));

    return { startOfWeek: startOfWeek / 1000, endOfWeek: endOfWeek / 1000 };
  },

  getStartAndEndOfDay: currentDate => {
    // Get the start of the day
    const startOfDay = new Date(currentDate);
    startOfDay.setHours(0, 0, 0, 0);

    // Get the end of the day
    const endOfDay = new Date(currentDate);
    endOfDay.setHours(23, 59, 59, 999);

    return { startOfDay: startOfDay / 1000, endOfDay: endOfDay / 1000 };
  },

  getDistrictByPinCode: async pinCOde => {
    let url = "https://api.postalpincode.in/pincode/" + pinCOde;
    let options = {
      url: url,
      method: "GET",
      maxBodyLength: Infinity,
      headers: {
        "User-Agent": "Super Agent/0.0.1",
        "Content-Type": "application/json",
      },
    };
    let response = await axios.request(options);
    return response?.data[0]?.PostOffice[0] ?? null;
  },

  getLocation: async (req, res, next) => {
    var axios = require("axios");
    var config = {
      method: "get",
      maxBodyLength: Infinity,
      url: `${awsConfig.googleApis.locationsApi}?input=${req.query.keyword}&key=${awsConfig.googleApis.apiKey}`,
      headers: {},
    };
    try {
      const data = await axios(config);
      let result = data?.data;
      module.exports.sendSuccess(req, res, next, {
        result,
      });
    } catch (err) {
      module.exports.sendError(req, res, next, err);
    }
  },

  getCoordinates: async (req, res, next) => {
    var axios = require("axios");
    var config = {
      method: "GET",
      maxBodyLength: Infinity,
      url: `${awsConfig.googleApis.coordinatesApi}?place_id=${req.query.place_id}&key=${awsConfig.googleApis.apiKey}`,
      headers: {},
    };
    try {
      const data = await axios(config);
      let result = data?.data;
      module.exports.sendSuccess(req, res, next, {
        result,
      });
    } catch (err) {
      module.exports.sendError(req, res, next, err);
    }
  },
  getCountries: async (req, res, next) => {
    const axios = require("axios");

    const config = {
      method: "GET",
      maxBodyLength: Infinity,
      url: `https://restcountries.com/v3.1/all`,
      headers: {},
    };

    try {
      const data = await axios(config);
      let result = data?.data;

      const countries = result.map(country => {
        const phoneCode = country.idd?.root + (country.idd?.suffixes?.length ? country.idd.suffixes[0] : "");

        return {
          name: country.name.common,
          code: country.cca2,
          region: country.region,
          phoneCode: phoneCode || "N/A",
          flag: country.flags?.svg || country.flags?.png || "", // Use SVG if available, otherwise PNG
        };
      });

      const searchQuery = req.body.search?.toLowerCase();

      const filteredCountries = searchQuery
        ? countries.filter(
            country =>
              country.name.toLowerCase().includes(searchQuery) ||
              country.region.toLowerCase().includes(searchQuery) ||
              country.phoneCode.includes(searchQuery),
          )
        : countries;

      module.exports.sendSuccess(req, res, next, {
        countries: filteredCountries,
      });
    } catch (err) {
      module.exports.sendError(req, res, next, err);
    }
  },

  getCountryAndSpecificState: async (req, res, next) => {
    const searchQuery = req.body.search?.toLowerCase();

    try {
      const countriesResponse = await axios.get(`https://restcountries.com/v3.1/all`);
      const countries = countriesResponse.data.map(country => {
        return {
          name: country.name.common,
          code: country.cca2,
          region: country.region,
        };
      });
      if (searchQuery) {
        const country = countries.find(c => c.name.toLowerCase() === searchQuery);

        if (country) {
          const headers = {
            "X-CSCAPI-KEY": API_KEY,
          };
          const statesResponse = await axios.get(
            `https://api.countrystatecity.in/v1/countries/${country.code}/states`,
            { headers },
          );
          return res.json({ states: statesResponse.data });
        } else {
          return res.status(404).json({ message: "Country not found." });
        }
      }
      return res.json({ countries });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "An error occurred while fetching data." });
    }
  },

  convertYearToMilliseconds: year => {
    let dateTimeNow = Math.floor(Date.now() / 1000);
    let milliseconds = 365.25 * year * 24 * 60 * 60;
    console.log("dateTimeNow - milliseconds", dateTimeNow - milliseconds);
    return dateTimeNow - milliseconds;
  },
  appVersion: async (req, res, next) => {
    try {
      let setting = await Setting.findOne({});
      module.exports.sendSuccess(req, res, next, {
        setting,
      });
    } catch (err) {
      module.exports.sendError(req, res, next, err);
    }
  },
  appVersionUpdate: async (req, res, next) => {
    try {
      let recordId = req.body.recordId;
      let queryObj = {
        _id: recordId,
      };
      let updateObj = req.body;
      const result = await Setting.findOneAndUpdate(queryObj, updateObj, {
        new: true,
      });

      module.exports.sendSuccess(req, res, next, {
        result,
      });
    } catch (err) {
      module.exports.sendError(req, res, next, err);
    }
  },

  parseTimeString: timeString => {
    const units = {
      m: 1,
      h: 60,
      d: 1440,
      w: 10080,
    };

    const regex = /(\d+)\s*(m|h|d|w)/gi;
    let totalMinutes = 0;

    let match;
    while ((match = regex.exec(timeString)) !== null) {
      const value = parseInt(match[1]);
      const unit = match[2].toLowerCase();
      totalMinutes += value * units[unit];
    }

    return totalMinutes;
  },
  // Utility function to validate required fields
  validateRequiredFields: (obj, requiredFields) => {
    const errors = [];
    requiredFields.forEach(field => {
      if (!obj[field]) {
        errors.push(`${field}  cannot be empty or undefined.`);
      }
    });
    return errors;
  },

  getDateRange(dateType) {
    const now = new Date();
    let startDate, endDate;

    switch (dateType) {
      case "day":
        startDate = new Date(now.setHours(0, 0, 0, 0)); // Start of today
        endDate = new Date(now.setHours(23, 59, 59, 999)); // End of today
        break;
      case "week":
        const dayOfWeek = now.getDay(); // Sunday = 0, Monday = 1, ..., Saturday = 6
        const diffToStartOfWeek = now.getDate() - dayOfWeek; // Go back to the start of the week (Sunday)
        const startOfWeek = new Date(now); // Create a new Date object for start of the week
        startOfWeek.setDate(diffToStartOfWeek); // Set the start of the week
        startDate = startOfWeek; // Start of this week

        const endOfWeek = new Date(startOfWeek); // Create a new Date object for end of the week
        endOfWeek.setDate(startOfWeek.getDate() + 6); // End of this week (Saturday)
        endOfWeek.setHours(23, 59, 59, 999); // Set end of week to 11:59:59.999
        endDate = endOfWeek;
        break;
      case "month":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1); // First day of the current month
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0); // Last day of the current month
        endDate.setHours(23, 59, 59, 999); // Set end of month to 11:59:59.999
        break;
      case "year":
        startDate = new Date(now.getFullYear(), 0, 1); // First day of the current year
        endDate = new Date(now.getFullYear(), 11, 31); // Last day of the current year
        endDate.setHours(23, 59, 59, 999); // Set end of year to 11:59:59.999
        break;
      default:
        throw new Error("Invalid dateType");
    }

    return {
      start: Math.floor(startDate.getTime() / 1000), // Convert to epoch time (seconds)
      end: Math.floor(endDate.getTime() / 1000), // Convert to epoch time (seconds)
    };
  },

  createMatchCondition: (userId, start, end, userType) => {
    const matchCondition = {
      createdAt: { $gte: start.getTime() / 1000, $lte: end.getTime() / 1000 },
      active: true,
    };
    if (userType === "employee") {
      matchCondition.employeeId = mongoose.Types.ObjectId(userId);
    } else if (userType === "manager") {
      matchCondition.managerId = mongoose.Types.ObjectId(userId);
    } else if (userType === "organizationAdmin") {
      matchCondition.organizationId = mongoose.Types.ObjectId(userId);
    }
    return matchCondition;
  },

  generateGroupStage: (datetype, additionalFields = {}) => {
    const group = {
      _id: {},
      count: { $sum: 1 },
      ...additionalFields, // Add any extra fields dynamically
    };

    // Adjust `_id` grouping based on `datetype`
    switch (datetype) {
      case "day":
        group._id = {
          day: { $dayOfMonth: { $toDate: { $multiply: [1000, "$createdAt"] } } },
          month: { $month: { $toDate: { $multiply: [1000, "$createdAt"] } } },
          year: { $year: { $toDate: { $multiply: [1000, "$createdAt"] } } },
        };
        break;
      case "month":
        group._id = {
          month: { $month: { $toDate: { $multiply: [1000, "$createdAt"] } } },
          year: { $year: { $toDate: { $multiply: [1000, "$createdAt"] } } },
        };
        break;
      case "year":
        group._id = {
          year: { $year: { $toDate: { $multiply: [1000, "$createdAt"] } } },
        };
        break;
      default:
        throw new Error("Invalid datetype. Allowed values are 'day', 'month', or 'year'.");
    }
    if (additionalFields.taskStatus) {
      group._id.taskStatus = "$taskStatus"; // Include taskStatus in the group key
    }
    return { $group: group };
  },
};
