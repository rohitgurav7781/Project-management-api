var request = require("request").defaults({
  encoding: null,
});
let mongoose = require("mongoose");
var fs = require("fs").promises;
let XLSX = require("xlsx");
const returnCode = require("../../../config/responseCode").returnCode;
const User = require("../../models/User");
const Customer = require("../../models/Customer");
const Tag = require("../../models/Tag");
const DataFileUpload = require("../../models/DataFileUpload");
const UtilController = require("./UtilController");
const AwsController = require("./AwsController");
const awsConfig = require("../../../config/connection");
const AWS = require("aws-sdk");
const UploadController = require("./UploadController");
const CryptoJS = require("crypto-js");
AWS.config.update({
  secretAccessKey: awsConfig.aws.secretAccessKey,
  accessKeyId: awsConfig.aws.accessKeyId,
  region: awsConfig.aws.region,
});

var passwordSecretKey = process.env.PASSWORD_SECRET_KEY;

module.exports = {
  processFile: async (dataFile, filePath, userId, req) => {
    try {
      const data = await fs.readFile(filePath); // Use await to read file data
      switch (dataFile.operationType) {
        case "uploadBulkUsers":
          return await module.exports.updateBulkUserUpload(dataFile, filePath, userId, data, req);

        case "uploadBulkCustomers":
          return await module.exports.updateBulkCustomerUpload(dataFile, filePath, userId, data, req);

        case "writeExcelFile":
          return module.exports.writeExcelFile(dataFile);

        default:
          return null;
      }
    } catch (err) {
      console.error(err);
      throw err; // Re-throw error to handle it in the calling function
    }
  },
  writeExcelFile: async dataFile => {
    var ws = XLSX.utils.json_to_sheet([
      {
        A: "S",
        B: "h",
        C: "e",
        D: "e",
        E: "t",
        F: "J",
        G: "S",
      },
      {
        A: 1,
        B: 2,
        C: 3,
        D: 4,
        E: 5,
        F: 6,
        G: 7,
      },
      {
        A: 2,
        B: 3,
        C: 4,
        D: 5,
        E: 6,
        F: 7,
        G: 8,
      },
    ]);
    var wb = XLSX.utils.book_new();
    var ws_name = "SheetJS";
    var ws_data = [
      ["S", "h", "e", "e", "t", "J", "S"],
      [1, 2, 3, 4, 5],
    ];
    XLSX.utils.book_append_sheet(wb, ws, ws_name);
    var wopts = {
      bookType: "xlsx",
      type: "base64",
    };

    var wbout = XLSX.write(wb, wopts);
    let bufferObj = Buffer.from(wbout, "base64");
    let decodedContent = bufferObj.toString("utf8");
    wbout = decodedContent;
    XLSX.writeFile(wb, "out.xlsx");
    await AwsController.upload2AWS(
      "E:\\Clients\\Usica\\server\\_workspace\\usica-server\\out.xlsx",
      // awsConfig.inventoryUploadProcessed,
      "usica.xlsx",
    );
  },
  updateBulkUserUpload: async (dataFile, filePath, userId, data, req) => {
    let uploadStatus = "processed";
    let successCount = 0;
    let failCount = 0;
    let processedData = [];
    let errorData = [];
    let error = null;
    let transformedData = [];
    const expectedHeaders = [
      "First Name",
      "Last Name",
      "Email",
      "Mobile Number",
      "Position",
      "Gender",
      "Total Experience",
    ];

    try {
      let workbook = XLSX.read(data, { type: "buffer" });
      let wsname = workbook.SheetNames[0];
      let ws = workbook.Sheets[wsname];
      let excelJSON = XLSX.utils.sheet_to_json(ws);

      // Check for the expected headers
      const actualHeaders = Object.keys(excelJSON[0]);

      transformedData = await Promise.all(
        excelJSON.map(async item => {
          try {
            let tagResult = await Tag.findOneAndUpdate(
              { active: true, tagType: "users" },
              {
                $inc: { sequenceNo: 1 },
                updatedAt: Math.floor(Date.now() / 1000),
              },
              { new: true },
            );

            const ciphertext = CryptoJS.AES.encrypt(item["Password"], passwordSecretKey);

            let userObj = {
              organizationId: dataFile.organizationId,
              fname: item["First Name"],
              lname: item["Last Name"],
              email: item["Email ID"],
              userName: item["User Name"],
              mobileNo: item["Mobile Number"],
              userType: item["User Type"],
              gender: item["Gender"],
              password: ciphertext.toString(),
              employeeId: tagResult.prefix + UtilController.pad(tagResult.sequenceNo, 3),
              operatedBy: req.session.userId,
              createdBy: req.session.userId,
              updatedAt: Math.floor(Date.now() / 1000),
              createdAt: Math.floor(Date.now() / 1000),
              active: true,
            };

            // Perform upsert operation
            const result = await User.findOneAndUpdate(
              { email: item["Email ID"] }, 
              { $set: userObj }, 
              { upsert: true, new: true }, 
            );

            successCount++;
            return result;
          } catch (error) {
            failCount++;
            errorData.push({ ...item, error: error.message });
            return null;
          }
        }),
      );

      transformedData = transformedData.filter(item => item !== null);

      let returnObj = {
        result: transformedData,
        successCount: successCount,
        failCount: failCount,
      };
      return returnObj;
    } catch (err) {
      uploadStatus = "error";
      error = err;
      console.log(err);
    }

    // Upload the processed Excel to AWS (or any other storage)
    module.exports.uploadProcessedExcel2Aws(req, transformedData, uploadStatus, {
      _id: dataFile._id,
      fileName: dataFile.fileName,
    });

    if (errorData.length > 0) {
      module.exports.uploadProcessedExcel2Aws(req, errorData, "error", {
        _id: dataFile._id,
        fileName: dataFile.fileName,
      });
    }
    console.log("uploadProcessedExcel2Aws", uploadStatus);

    if (uploadStatus === "error") {
      return error;
    } else {
      return { ...returnCode.success, successCount, failCount };
    }
  },

  updateBulkCustomerUpload: async (dataFile, filePath, userId, data, req) => {
    let uploadStatus = "processed";
    let processedData = [];
    let errorData = []; // i don't see this being used significantly
    let transformedData = [];
    let error = null;
    try {
      let workbook = XLSX.read(data, {
        type: "buffer",
      });
      let wsname = workbook.SheetNames[0];
      let ws = workbook.Sheets[wsname];
      let excelJSON = XLSX.utils.sheet_to_json(ws);

      transformedData = await Promise.all(
        excelJSON.map(async item => {
          // Increment sequence for SKU generation
          let tagResult = await Tag.findOneAndUpdate(
            { active: true, tagType: "customers" },
            {
              $inc: { sequenceNo: 1 },
              updatedAt: Math.floor(Date.now() / 1000),
            },
            { new: true },
          );

          return {
            organizationId: req.body.organizationId,
            customerName: item["customerName"],
            companyName: item["companyName"],
            email: item["email"],
            mobileNo: item["mobileNo"],
            address: item["address"],
            country: item["country"],
            state: item["state"],
            city: item["city"],
            postalCode: item["postalCode"],
            region: item["region"],
            logo: item["logo"],
            contactPerson: [
              {
                personName: item["personName"],
                email: item["personEmail"],
                phoneNo: item["personPhone"],
              },
            ],
            customerTagId: tagResult.prefix + UtilController.pad(tagResult.sequenceNo, 3),
            operatedBy: req.body.userId,
            createdBy: req.body.userId,
            updatedAt: Math.floor(Date.now() / 1000),
            createdAt: Math.floor(Date.now() / 1000),
          };
        }),
      );
      // Perform operations on transformedData (e.g., insert into database)
      await module.exports.operateCollection(transformedData, "uploadBulkCustomers");
    } catch (err) {
      uploadStatus = "error";
      error = err;
    }

    // Upload the processed Excel to AWS (or any other storage)
    module.exports.uploadProcessedExcel2Aws(req, transformedData, uploadStatus, {
      _id: dataFile._id,
      fileName: dataFile.fileName,
    });

    if (errorData.length > 0) {
      module.exports.uploadProcessedExcel2Aws(req, errorData, "error", {
        _id: dataFile._id,
        fileName: dataFile.fileName,
      });
    }
    if (uploadStatus === "error") {
      return error;
    } else return returnCode.success;
  },

  uploadProcessedExcel2Aws: async (req, jsonData, status, dataFile) => {
    try {
      let additionalInfo = [{}];
      jsonData.map((json, index) => {
        if (!UtilController.isEmpty(json?.additionalInfo)) {
          json.additionalInfo.map((data, key) => {
            if (!UtilController.isEmpty(data)) {
              additionalInfo[index] = {
                ...additionalInfo[index],
                productSku: json.productSku,
                [data.heading]: Buffer.from(data.content, "base64").toString("ascii"),
              };
            }
          });
        }
      });

      var ws_data1 = XLSX.utils.json_to_sheet(additionalInfo);

      let additionalMMInfo = [{}];
      jsonData.map((json, index) => {
        if (!UtilController.isEmpty(json?.mmAdditionalInfo) && !UtilController.isEmpty(json?.mmAdditionalInfo?.my_MM)) {
          json.mmAdditionalInfo.my_MM.map((data, key) => {
            additionalMMInfo[index] = {
              ...additionalMMInfo[index],
              productSku: json.productSku,
              [data.heading]: Buffer.from(data.content, "base64").toString("ascii"),
            };
          });
        }
      });

      var ws_data3 = XLSX.utils.json_to_sheet(additionalMMInfo);

      let additionali18nInfo = [{}];
      jsonData.map((json, index) => {
        if (
          !UtilController.isEmpty(additionali18nInfo[index]) &&
          !UtilController.isEmpty(additionali18nInfo[index].my_MM)
        ) {
          additionali18nInfo[index] = {
            ...additionali18nInfo[index],
            ...json.i18n.my_MM,
          };
        }
      });

      var ws_data2 = XLSX.utils.json_to_sheet(additionali18nInfo);
      var ws_data = XLSX.utils.json_to_sheet(jsonData);

      delete ws_data.mmAdditionalInfo;

      var wb = XLSX.utils.book_new();
      var ws_name = "bulkUploadUsers";
      XLSX.utils.book_append_sheet(wb, ws_data, ws_name);

      const wbout = XLSX.write(wb, {
        bookType: "xlsx",
        type: "buffer",
      });

      let fileName = Date.now() + "_" + dataFile.fileName;
      // let bucket = awsConfig.awsBuckets.inventoryLogs;
      // if (status === "error") {
      //   bucket = awsConfig.awsBuckets.inventoryErrorLogs;
      // }
      // here also upload function for getting the success or error files
      // let awsResultUrl = await AwsController.uploadExcel2AwsWithReturn(wbout, bucket, fileName);
      let storagePath = UploadController.uploadFile_notInReq(req, wbout, status, fileName);
      let processedFilePath, errorFilePath;
      if (status === "error") {
        errorFilePath = storagePath[0];
      } else {
        processedFilePath = storagePath[0];
      }
      await DataFileUpload.findByIdAndUpdate(dataFile._id, {
        status: status,
        processedFilePath,
        errorFilePath,
        updatedAt: Math.floor(Date.now() / 1000),
      });
    } catch (err) {
      console.error(err);
    }
  },

  operateCollection: async (userObj, operationType, req) => {
    let successCount = 0;
    let failCount = 0;

    try {
      switch (operationType) {
        case "uploadBulkUsers":
          for (const user of userObj) {
            try {
              const userCopy = { ...user };

              if (user.userType === "admin") {
                delete userCopy.dateOfJoining;
                delete userCopy.department;
                delete userCopy.departmentId;
                delete userCopy.employeeId;
                delete userCopy.fcmToken;
                delete userCopy.isDepartmentHead;
                delete userCopy.organizationId;
                delete userCopy.organizationName;
                delete userCopy.reportedTo;
                delete userCopy.reportingManagerName;
                delete userCopy.totalExp;
              } else if (user.userType === "Manager") {
                delete userCopy.dateOfJoining;
                delete userCopy.employeeId;
                delete userCopy.fcmToken;
                delete userCopy.isDepartmentHead;
                delete userCopy.reportedTo;
                delete userCopy.reportingManagerName;
                delete userCopy.totalExp;
              } else if (user.userType === "Organization Admin") {
                delete userCopy.dateOfJoining;
                delete userCopy.department;
                delete userCopy.departmentId;
                delete userCopy.employeeId;
                delete userCopy.fcmToken;
                delete userCopy.isDepartmentHead;
                delete userCopy.position;
                delete userCopy.reportedTo;
                delete userCopy.reportingManagerName;
                delete userCopy.totalExp;
              }

              await User.create(userCopy);
              successCount++;
            } catch (error) {
              failCount++;
            }
          }
          break;

        case "uploadBulkCustomers":
          for (const customer of userObj) {
            try {
              await Customer.create(customer);
              successCount++;
            } catch (error) {
              failCount++;
            }
          }
          break;

        default:
          throw new Error(`Unknown operationType: ${operationType}`);
      }
    } catch (err) {
      throw err;
    }

    return {
      successCount,
      failCount,
    };
  },

  excelDateToJSDate: serial => {
    // Excel's date serial number starts from January 1, 1900, but there is a bug that includes February 29, 1900 (which did not exist)
    const excelEpoch = new Date(Date.UTC(1900, 0, 1));
    const jsDate = new Date(excelEpoch.getTime() + (serial - 1) * 24 * 60 * 60 * 1000);
    return jsDate.getTime() / 1000;
  },
};
