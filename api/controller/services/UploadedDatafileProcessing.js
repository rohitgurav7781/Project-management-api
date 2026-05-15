var request = require("request").defaults({
  encoding: null,
});
let mongoose = require("mongoose");
var fs = require("fs").promises;
let XLSX = require("xlsx");
const returnCode = require("./../../../config/responseCode").returnCode;
const User = require("./../../models/User");
const Customer = require("./../../models/Customer");
const Department = require("./../../models/Department");
const crypto = require("crypto");
const Tag = require("./../../models/Tag");
const DataFileUpload = require("./../../models/DataFileUpload");
const UtilController = require("./../services/UtilController");
const AwsController = require("./../services/AwsController");
const awsConfig = require("./../../../config/connection");
const AWS = require("aws-sdk");
const UploadController = require("./UploadController");
const EmailController = require("../services/EmailController");
const CryptoJS = require("crypto-js");
const Organizations = require("../../models/Organizations");
const Role = require("../../models/Role");
const { sendInAppNotification } = require("./NotificationController");
const Notification = require("../../models/Notification");
AWS.config.update({
  secretAccessKey: awsConfig.aws.secretAccessKey,
  accessKeyId: awsConfig.aws.accessKeyId,
  region: awsConfig.aws.region,
});

var passwordSecretKey = process.env.PASSWORD_SECRET_KEY;

module.exports = {
  processFile: async (dataFile, filePath, userId, req, organizationId) => {
    try {
      const data = await fs.readFile(filePath); // Use await to read file data
      switch (dataFile.operationType) {
        case "uploadBulkUsers":
          return await module.exports.updateBulkUserUpload(dataFile, filePath, userId, data, req, organizationId);

        case "uploadBulkCustomers":
          return await module.exports.updateBulkCustomerUpload(dataFile, filePath, userId, data, req, organizationId);

        default:
          return null;
      }
    } catch (err) {
      console.error(err);
      throw err; // Re-throw error to handle it in the calling function
    }
  },
  updateBulkUserUpload: async (dataFile, filePath, userId, data, req, organizationId) => {
    let uploadStatus = "processed";
    let successCount = 0;
    let failCount = 0;
    let totalCount = 0;
    let processedData = [];
    let errorData = [];
    let error = null;
    let transformedData = [];
    let successData = [];
    let ownerUploadId = userId;

    function returnNormalEpochDate(date) {
      if (typeof date === "number") {
        // Convert Excel serial number to date
        const excelEpochDate = new Date(Math.round((date - 25569) * 86400 * 1000));
        return Math.floor(excelEpochDate.getTime() / 1000);
      } else if (typeof date === "string") {
        const dateParts = date.split("-");
        if (dateParts.length === 3) {
          const day = parseInt(dateParts[0]);
          const month = parseInt(dateParts[1]); // No adjustment yet
          const year = parseInt(dateParts[2]);

          // Check if month is between 1 and 12
          if (month < 1 || month > 12) {
            return null;
          }

          // Create the date object
          const dateObj = new Date(Date.UTC(year, month - 1, day)); // Adjust month to 0-based
          if (
            dateObj.getUTCDate() !== day ||
            dateObj.getUTCMonth() + 1 !== month || // Months are 0-based
            dateObj.getUTCFullYear() !== year
          ) {
            return null; // Invalid date
          }

          return dateObj.getTime() / 1000; // Valid date as epoch
        }
      }
      return null; // Return null if not a valid date
    }

    function returnEpochDate(date) {
      if (typeof date === "number") {
        const excelEpochDate = new Date(Math.round((date - 25569) * 86400 * 1000));
        const currentDate = new Date();
        const age = currentDate.getUTCFullYear() - excelEpochDate.getUTCFullYear();
        const isBeforeBirthday =
          currentDate.getUTCMonth() < excelEpochDate.getUTCMonth() ||
          (currentDate.getUTCMonth() === excelEpochDate.getUTCMonth() &&
            currentDate.getUTCDate() < excelEpochDate.getUTCDate());
        const actualAge = isBeforeBirthday ? age - 1 : age;
        const isVerify = actualAge >= 18;

        return {
          epoch: Math.floor(excelEpochDate.getTime() / 1000),
          isVerify,
        };
      } else if (typeof date === "string") {
        const dateParts = date.split("-");
        if (dateParts.length === 3) {
          const day = parseInt(dateParts[0], 10);
          const month = parseInt(dateParts[1], 10) - 1;
          const year = parseInt(dateParts[2], 10);

          if (
            isNaN(day) ||
            isNaN(month) ||
            isNaN(year) ||
            day < 1 ||
            day > 31 ||
            month < 0 ||
            month > 11 ||
            year < 1900 ||
            year > 2100
          ) {
            throw new Error(`Invalid date format or range: ${date}`);
          }

          const enteredDate = new Date(Date.UTC(year, month, day));
          if (
            enteredDate.getUTCFullYear() !== year ||
            enteredDate.getUTCMonth() !== month ||
            enteredDate.getUTCDate() !== day
          ) {
            throw new Error(`Invalid date value: ${date}`);
          }

          const currentDate = new Date();
          const age = currentDate.getUTCFullYear() - enteredDate.getUTCFullYear();
          const isBeforeBirthday =
            currentDate.getUTCMonth() < enteredDate.getUTCMonth() ||
            (currentDate.getUTCMonth() === enteredDate.getUTCMonth() &&
              currentDate.getUTCDate() < enteredDate.getUTCDate());
          const actualAge = isBeforeBirthday ? age - 1 : age;
          const isVerify = actualAge >= 18;

          return {
            epoch: Math.floor(enteredDate.getTime() / 1000),
            isVerify,
          };
        }
      }

      return { epoch: null, isVerify: false };
    }

    //converting excel date to normal time string
    function formatDate(epochTime) {
      if (!epochTime) return null;
      const date = new Date(epochTime * 1000);
      const day = date.getUTCDate().toString().padStart(2, "0");
      const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
      const year = date.getUTCFullYear();
      return `${day}-${month}-${year}`;
    }

    try {
      let workbook = XLSX.read(data, { type: "buffer" });
      let wsname = workbook.SheetNames[0];
      let ws = workbook.Sheets[wsname];
      let excelJSON = XLSX.utils.sheet_to_json(ws);

      // Check if the sheet contains any data
      if (!excelJSON || excelJSON.length === 0) {
        uploadStatus = "error";
        throw new Error("No data found in the uploaded sheet.");
      }

      totalCount = excelJSON.length;
      const phoneRegex = /^[0-9]{0,10}$/;

      transformedData = await Promise.all(
        excelJSON.map(async item => {
          try {
            const mobileNo = item["Mobile Number"];
            const email = item["Email Id"];
            // const userName = item["User Name"];
            const firstName = item["First Name"];
            const lastName = item["Last Name"];
            const userType = item["User Type"];
            const designation = item["Designation"];
            const userEmployeeId = item["Employee ID"];
            const dob = item["Date of Birth"];
            const dateOfJoining = item["Date of Joining"];
            const gender = item["Gender"];
            const permissionRole = item["Role Name"];
            const countryCode = item["Country Code"];
            const reportedTo = item["Reporting Manager Id"];
            const password = item["Password"]?.toString();
            let employeeId = "";
            let verifiedDateOfBirth = returnEpochDate(dob);
            if (!UtilController.isEmpty(dob) && !verifiedDateOfBirth?.epoch) {
              throw new Error(`Invalid Date of Birth`);
            }

            const verifiedDateOfJoining = returnNormalEpochDate(dateOfJoining);
            if (!UtilController.isEmpty(dateOfJoining) && !verifiedDateOfJoining) {
              throw new Error(`Invalid Date of Joining`);
            }
            if (!mobileNo) throw new Error("Mobile number is missing.");
            if (!email) throw new Error("Email is missing.");
            // if (!userName) throw new Error("User name is missing.");
            if (!firstName) throw new Error("First name is missing.");
            // if (!lastName) throw new Error("Last name is missing.");
            if (!userType) throw new Error("User type is missing.");
            if (!gender) throw new Error("Gender is missing.");
            if (!password) throw new Error("Password is missing.");

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
              throw new Error("Invalid email format.");
            }

            if (!UtilController.isEmpty(userEmployeeId)) {
              employeeId = userEmployeeId;
            } else {
              if (!UtilController.isEmpty(dataFile.organizationId)) {
                let retries = 3;
                while (retries > 0) {
                  try {
                    const organization = await Organizations.findOneAndUpdate(
                      { _id: dataFile.organizationId },
                      {
                        $inc: { employeeSequenceNo: 1 },
                        updatedAt: Math.floor(Date.now() / 1000),
                      },
                      { new: true, projection: "organizationName employeePrefix employeeSequenceNo" },
                    );

                    if (organization) {
                      if (organization.employeePrefix) {
                        employeeId =
                          organization.employeePrefix + UtilController.pad(organization.employeeSequenceNo ?? 0, 5);
                        break;
                      } else {
                        throw new Error("Employee prefix is empty. Falling back to Tag-based generation.");
                      }
                    } else {
                      throw new Error("Organization not found.");
                    }
                  } catch (err) {
                    retries--;
                    if (retries === 0) {
                      console.warn(err.message);
                      await generateTagBasedEmployeeId();
                      break;
                    }
                  }
                }
              } else {
                await generateTagBasedEmployeeId();
              }
            }

            async function generateTagBasedEmployeeId() {
              let retries = 3;
              while (retries > 0) {
                try {
                  const tagResult = await Tag.findOneAndUpdate(
                    { active: true, tagType: "users" },
                    { $inc: { sequenceNo: 1 }, updatedAt: Math.floor(Date.now() / 1000) },
                    { new: true },
                  );

                  if (tagResult) {
                    employeeId = tagResult.prefix + UtilController.pad(tagResult.sequenceNo, 5);
                    // console.log(`Generated Employee ID from Tag: ${employeeId}`);
                    break;
                  } else {
                    throw new Error("Tag for employee ID sequence not found.");
                  }
                } catch (err) {
                  retries--;
                  console.warn(err.message);

                  if (retries === 0) {
                    throw new Error("Failed to generate a unique tag-based employee ID after retries.");
                  }
                }
              }
            }

            // here in this block we will query out the departmentId and roleId as changing to name will effect other places

            //for departmentTagId
            const departmentId = await Department.findOne({
              name: item["Department Name"],
              organizationId: organizationId,
            });
            const roleNames = item["Role Name"];
            const roleIds = await Role.find({ name: { $in: roleNames }, organizationId: organizationId });
            // console.log(roleIds)

            // Fetch permission IDs based on the role from the Role collection
            let permissionIds = [];
            if (roleIds) {
              const roles = roleIds?.map(role => role.roleTagId);
              console.log(roles)

              if (roles.length > 0) {
                const roleDocs = await Role.find(
                  {
                    roleTagId: { $in: roles.map(role => new RegExp(`^${role}$`, "i")) },
                    active: true,
                  },
                  "_id",
                );

                if (roleDocs.length > 0) {
                  permissionIds = roleDocs.map(role => role._id.toString());
                } else {
                  throw new Error(`Role(s) not found: ${roles.join(", ")}`);
                }
              } else {
                throw new Error("No roles provided.");
              }
            } else {
              throw new Error("permissionRole is undefined or empty.");
            }

            const ciphertext = CryptoJS.AES.encrypt(password, passwordSecretKey);
            if (!phoneRegex.test(mobileNo)) {
              throw new Error(`Phone number should be 10 digits for the employeeId: ${employeeId}`);
            }

            //verify date of birth which should be below >18
            if (!UtilController.isEmpty(dob) && !verifiedDateOfBirth?.isVerify) {
              throw new Error(`Age should be above 18 for employeeId: ${employeeId}`);
            }
            let organizationDetails = await Organizations.findById(organizationId).select("organizationName");
            let userObj = {
              organizationId: organizationId,
              organizationName: organizationDetails?.organizationName,
              fname: item["First Name"],
              lname: item["Last Name"],
              email,
              userName: item["User Name"] || "",
              mobileNo,
              userType: item["User Type"],
              gender: item["Gender"],
              reportedTo: reportedTo,
              dob: verifiedDateOfBirth?.epoch,
              dateOfJoining: returnNormalEpochDate(dateOfJoining),
              designation: designation,
              countryCode,
              departmentId: departmentId?.departmentId,
              password: ciphertext?.toString(),
              employeeId: employeeId,
              permission: permissionIds,
              operatedBy: ownerUploadId,
              createdBy: ownerUploadId,
              isSuperAdmin: false,
              emailVerified: true,
              passwordReset: false,
              updatedAt: Math.floor(Date.now() / 1000),
              createdAt: Math.floor(Date.now() / 1000),
              active: true,
            };
            delete userObj?.userName;
            const result = await User.findOneAndUpdate(
              { employeeId: userEmployeeId },
              { $set: userObj },
              { upsert: true, new: true },
            ).populate("organizationId");
            if (!UtilController.isEmpty(result?.permission) && Array.isArray(result?.permission)) {
              for (const permissionId of result?.permission) {
                const roleId = mongoose.Types.ObjectId(permissionId);

                await Role.findByIdAndUpdate(
                  roleId,
                  {
                    $addToSet: { owner: result?._id },
                    $set: { updatedAt: Math.floor(Date.now() / 1000) },
                  },
                  { new: true },
                );
              }
            }
            //below funtions are to trigger notifications and to send email notifications
            const sessionHash = crypto.randomBytes(32).toString("hex");
            let combinedToken = "";
            combinedToken = `${result?.employeeId}:${sessionHash}`;
            const token = Buffer.from(combinedToken).toString("base64");
            let emailData = {
              toAddresses: [{ email: result?.email, name: `${result.fname} ${result?.lname}` }],
              subject: "Welcome to SPMS! Here’s how to get started",
              html: `
        <div>
          <h2>Welcome ${result.fname} ${result.lname}</h2>
          <p>Your account has been successfully created.</p>
          <p><strong>EmployeeId:</strong> ${result?.employeeId}</p>
          <p><strong>Temporary Password:</strong> ${item["Password"]}</p>
          <p>Please change your password by clicking the link below:</p>
         <a href="${awsConfig.configUserUrl.createUserUrl}?token=${token}" style="padding: 10px 15px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px;">
             
            Reset Password
          </a>
        </div>
      `,
            };

            await EmailController.sendCustomMail(emailData);
            await Notification.create({
              userId: result._id,
              senderId: result._id,
              title: `New User Joined`,
              body: `A new user has joined the organization ${result?.organizationId?.organizationName}. Click to view their details`,
              type: "system",
              read: false,
              visibleOnHome: true,
              actionUrl: `/users?id=${result._id}`,
              recordId: result._id,
              userType: "superAdmin",
            });

            await Notification.create({
              userId: result.organizationId,
              senderId: req.session.userId,
              title: `New User Created`,
              organizationId: result?.organizationId,
              body: `A new user ${result?.fname} ${result?.lname} has been successfully created. Click to manage their profile`,
              type: "system",
              read: false,
              visibleOnHome: true,
              actionUrl: `/users?id=${result._id}`,
              recordId: result._id,
              userType: "organizationAdmin",
            });
            successData.push({
              "First Name": item["First Name"],
              "Last Name": item["Last Name"],
              "Email Id": item["Email Id"],
              "Mobile Number": item["Mobile Number"],
              "User Name": item["User Name"],
              "User Type": item["User Type"],
              "Country Code": item["Country Code"],
              "Date of Birth": formatDate(returnNormalEpochDate(item["Date of birth"])),
              Designation: item["Designation"],
              "Date of Joining": formatDate(returnNormalEpochDate(dateOfJoining)),
              Gender: item["Gender"],
              "Reporting Manager": item["Reporting Manager Id"],
              Department: item["Department Name"],
              Password: item["Password"],
              Role: item["Role Name"],
            });
            successCount++;
            await module.exports.uploadProcessedExcel2Aws(req, successData, "success", {
              _id: dataFile._id,
              fileName: dataFile.fileName,
            });
            return { ...item, status: "success", userId: result._id };
          } catch (error) {
            let errorMessage = null;
            if (error.code === 11000) {
              const keyValue = error.keyValue || {};
              const fieldName = Object.keys(keyValue)[0];
              const fieldValue = keyValue[fieldName];
              errorMessage = `Duplicate key error: The ${fieldName} "${fieldValue}" already exists.`;
            }
            failCount++;
            errorData.push({
              "First Name": item["First Name"],
              "Last Name": item["Last Name"],
              "Email Id": item["Email Id"],
              "Mobile Number": item["Mobile Number"],
              "User Name": item["User Name"],
              "User Type": item["User Type"],
              "Country Code": item["Country Code"],
              "Date of Birth": formatDate(returnNormalEpochDate(item["Date of birth"])),
              Designation: item["Designation"],
              "Date of joining": formatDate(returnNormalEpochDate(item["Date of joining"])),
              Gender: item["Gender"],
              "Reporting Manager": item["Reporting Manager Id"],
              Department: item["Department Name"],
              Password: item["Password"],
              Role: item["Role Name"],
              "Error Details": error.code === 11000 ? errorMessage : error.message,
            });
            return { ...item, status: "failure", error: error.message };
          }
        }),
      );

      if (errorData.length > 0) {
        //below we'll not send error in errorData
        // const sanitizedErrorData = errorData.map(({ error, ...rest }) => rest);
        await module.exports.uploadProcessedExcel2Aws(req, errorData, "error", {
          _id: dataFile._id,
          fileName: dataFile.fileName,
        });
      }

      await DataFileUpload.findByIdAndUpdate(
        dataFile?._id,
        {
          $set: {
            successCount,
            errorCount: failCount,
            totalCount,
          },
        },
        { new: true },
      );

      return {
        ...returnCode.success,
        successCount,
        failCount,
        totalCount,
        errorDetails: errorData,
      };
    } catch (err) {
      uploadStatus = "error";
      error = err;

      console.log("error", err);
      return {
        success: false,
        message: "An error occurred while processing the upload",
        error: err.message,
        totalCount,
      };
    }
  },

  updateBulkCustomerUpload: async (dataFile, filePath, userId, data, req) => {
    let uploadStatus = "processed";
    let processedData = [];
    let errorData = [];
    let transformedData = [];
    let successData = [];
    let error = null;
    let successCount = 0;
    let failCount = 0;

    try {
      let workbook = XLSX.read(data, { type: "buffer" });
      let wsname = workbook.SheetNames[0];
      let ws = workbook.Sheets[wsname];
      let excelJSON = XLSX.utils.sheet_to_json(ws);

      if (!excelJSON || excelJSON.length === 0) {
        uploadStatus = "error";
        throw new Error("No data found in the uploaded sheet.");
      }

      const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
      const phoneRegex = /^[0-9]{0,10}$/;

      transformedData = await Promise.all(
        excelJSON.map(async item => {
          try {
            // Mandatory field validations
            if (!item["email"]) throw new Error("Email field is required.");
            if (!emailRegex.test(item["email"])) throw new Error(`Invalid email: ${item["email"]}`);

            if (!item["mobileNo"]) throw new Error("Mobile number field is required.");

            // if (!item["customerName"]) throw new Error("Customer name field is required.");
            if (!item["companyName"]) throw new Error("Company name field is required.");
            if (!item["address"]) throw new Error("Address field is required.");
            if (!item["country"]) throw new Error("Country field is required.");
            if (!item["state"]) throw new Error("State field is required.");
            if (!item["city"]) throw new Error("City field is required.");
            if (!item["city"]) throw new Error("City field is required.");
            if (!item["postalCode"]) throw new Error("Postal code field is required.");

            // Optional field validation for contact person
            if (item["personEmail"] && !emailRegex.test(item["personEmail"])) {
              throw new Error(`Invalid contact person email: ${item["personEmail"]}`);
            }
            if (item["personPhone"] && !phoneRegex.test(item["personPhone"])) {
              throw new Error(`Invalid contact person phone: ${item["personPhone"]}`);
            }

            let customerId = item["customerId"];

            if (UtilController.isEmpty(customerId)) {
              let tagResult = await Tag.findOneAndUpdate(
                { active: true, tagType: "customers" },
                {
                  $inc: { sequenceNo: 1 },
                  updatedAt: Math.floor(Date.now() / 1000),
                },
                { new: true },
              );

              customerId = tagResult.prefix + UtilController.pad(tagResult.sequenceNo, 3);
            }

            if (!phoneRegex.test(item["mobileNo"])) {
              throw new Error(
                `Phone number should be 10 digits for the Customer Id: ${
                  tagResult.prefix + UtilController.pad(tagResult.sequenceNo, 3)
                }`,
              );
            }

            let customerData = {
              organizationId: req.body.organizationId,
              customerName: item["customerName"],
              companyName: item["companyName"],
              email: item["email"],
              mobileNo: item["mobileNo"],
              address: item["address"],
              country: item["country"],
              state: item["state"],
              city: item["city"],
              countryCode: item["countryCode"],
              postalCode: item["postalCode"],
              // region: item["region"],
              // logo: item["logo"],
              contactPerson: [
                {
                  personName: item["personName"],
                  email: item["personEmail"],
                  phoneNo: item["personPhone"],
                  countryCode: item["personCountryCode"],
                  jobTitle: item["jobTitle"],
                },
              ],
              customerTagId: customerId,
              operatedBy: req.body.userId,
              createdBy: req.body.userId,
              updatedAt: Math.floor(Date.now() / 1000),
              createdAt: Math.floor(Date.now() / 1000),
              active: true,
            };
            console.log(customerData);
            try {
              await Customer.findOneAndUpdate(
                { customerTagId: item["customerId"] },
                { $set: customerData },
                { upsert: true, new: true },
              );
              successData.push({
                customerId: item["customerId"],
                companyName: item["companyName"],
                email: item["email"],
                mobileNo: item["mobileNo"],
                address: item["address"],
                country: item["country"],
                state: item["state"],
                city: item["city"],
                postalCode: item["postalCode"],
                countryCode: item["countryCode"],
                // region: item["region"],
                // logo: item["logo"],
                personName: item["personName"],
                personEmail: item["personEmail"],
                personPhone: item["personPhone"],
                jobTitle: item["jobTitle"],
                personCountryCode: item["personCountryCode"],
              });
              successCount++;
              await module.exports.uploadProcessedExcel2Aws(req, successData, "success", {
                _id: dataFile._id,
                fileName: dataFile.fileName,
              });
            } catch (error) {
              failCount++;
              errorData.push({
                customerId: item["customerId"],
                // customerName: item["customerName"],
                companyName: item["companyName"],
                email: item["email"],
                mobileNo: item["mobileNo"],
                address: item["address"],
                country: item["country"],
                state: item["state"],
                city: item["city"],
                postalCode: item["postalCode"],
                countryCode: item["countryCode"],
                // region: item["region"],
                // logo: item["logo"],
                personName: item["personName"],
                personEmail: item["personEmail"],
                jobTitle: item["jobTitle"],
                personPhone: item["personPhone"],
                personCountryCode: item["personCountryCode"],
                "Error Details": error.message,
              });
            }

            return customerData;
          } catch (error) {
            failCount++;
            errorData.push({
              customerId: item["customerId"],
              // customerName: item["customerName"],
              companyName: item["companyName"],
              email: item["email"],
              mobileNo: item["mobileNo"],
              address: item["address"],
              country: item["country"],
              state: item["state"],
              city: item["city"],
              postalCode: item["postalCode"],
              countryCode: item["countryCode"],
              // region: item["region"],
              // logo: item["logo"],
              personName: item["personName"],
              jobTitle: item["jobTitle"],
              personEmail: item["personEmail"],
              personPhone: item["personPhone"],
              personCountryCode: item["personCountryCode"],
              error: error.message,
            });
            return { status: "failure", error: error.message, errorData };
          }
        }),
      );
      // const sanitizedSuccessData = transformedData.map(({ error, ...rest }) => rest);
      await module.exports.uploadProcessedExcel2Aws(req, successData, uploadStatus, {
        _id: dataFile._id,
        fileName: dataFile.fileName,
      });
    } catch (err) {
      uploadStatus = "error";
      error = err;
    }

    if (errorData.length > 0) {
      //below we'll not send error in errorData
      // const sanitizedErrorData = errorData.map(({ error, ...rest }) => rest);
      await module.exports.uploadProcessedExcel2Aws(req, errorData, "error", {
        _id: dataFile._id,
        fileName: dataFile.fileName,
      });
    }
    await DataFileUpload.findByIdAndUpdate(
      dataFile?._id,
      {
        $set: {
          successCount,
          errorCount: failCount,
          totalCount: successCount + failCount,
        },
      },
      { new: true },
    );
    if (uploadStatus === "error") {
      return { status: "error", message: error.message };
    } else {
      return {
        successCount,
        failCount,
        message: "Upload and customer creation completed.",
        errorData,
      };
    }
  },

  uploadProcessedLocalFile: async (jsonData, status, dataFile, type, req) => {
    try {
      // console.log("json", jsonData);
      // status can be processed or error
      var ws_data = XLSX.utils.json_to_sheet(jsonData);

      var wb = XLSX.utils.book_new();
      var ws_name = "Report";
      /* Add the worksheet to the workbook */
      XLSX.utils.book_append_sheet(wb, ws_data, ws_name);

      const wbout = XLSX.write(wb, {
        bookType: "xlsx",
        type: "buffer",
      });

      if (wbout) {
        console.log("file is converting to excel");
      }

      let fileName = Date.now() + "_" + dataFile.fileName;
      let bucket = awsConfig.aws.inventoryUploadProcessed;
      if (status === "error") {
        bucket = awsConfig.aws.inventoryUploadError;
      }

      let awsResultUrl = await AwsController.uploadExcel2AwsWithReturn(wbout, bucket, fileName);
      let processedFilePath, errorFilePath;
      if (status === "error") {
        errorFilePath = awsResultUrl;
      } else {
        processedFilePath = awsResultUrl;
      }

      // console.log(processedFilePath);

      if (type === "download") {
        let user = await User.findById(req.session.userId).select("email fname");

        NotificationController.DownloadLink({
          //userId: req.session.userId,
          //emailId,
          emailId: user.email,
          link: processedFilePath,
          receiverName: user.fname,
        });

        DataFileUpload.create(dataFile._id, {
          status: status,
          processedFilePath,
          errorFilePath,
          operationType: "download",
          updatedAt: Math.floor(Date.now() / 1000),
        });
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
  uploadProcessedExcel2Aws: async (req, jsonData, status, dataFile) => {
    try {
      // console.log("status", status);
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
        await DataFileUpload.findByIdAndUpdate(dataFile._id, {
          status: "error",
          errorFilePath,
          updatedAt: Math.floor(Date.now() / 1000),
        });
      } else if (status === "success") {
        processedFilePath = storagePath[0];
        await DataFileUpload.findByIdAndUpdate(dataFile._id, {
          status: "success",
          processedFilePath: storagePath[0],
          updatedAt: Math.floor(Date.now() / 1000),
        });
      }
    } catch (err) {
      console.error(err);
    }
  },

  operateCollection: async (userObj, operationType, req) => {
    let successCount = 0;
    let failCount = 0;
    let totalCount = userObj.length;

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
      totalCount,
    };
  },
  excelDateToJSDate: serial => {
    // Excel's date serial number starts from January 1, 1900, but there is a bug that includes February 29, 1900 (which did not exist)
    const excelEpoch = new Date(Date.UTC(1900, 0, 1));
    const jsDate = new Date(excelEpoch.getTime() + (serial - 1) * 24 * 60 * 60 * 1000);
    return jsDate.getTime() / 1000;
  },
};
