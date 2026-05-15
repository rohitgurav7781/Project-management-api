let request = require("request");
let mongoose = require("mongoose");
var CryptoJS = require("crypto-js");
const User = require("../../models/User");
const bcrypt = require("bcrypt");
const XLSX = require("xlsx");
// const axios = require('axios');

const DataFileUpload = require("../../models/DataFileUpload");
const crypto = require("crypto");
const moment = require("moment");
const Tag = require("../../models/Tag");
const Options = require("../../models/Option");
const qs = require("qs");
const configuration = require("../../../config/configuration");
const UploadedDatafileProcessing = require("../services/UploadedDatafileProcessing");
const NotificationController = require("../services/NotificationController");
const UtilController = require("../services/UtilController");
const returnCode = require("../../../config/responseCode").returnCode;
const awsConfig = require("../../../config/connection");
var passwordSecretKey = "Vaxi@2O$1"; // (pimarq)this is standerd key to generate password
const NodeCache = require("node-cache");
const State = require("../../models/State");
const District = require("../../models/District");
const responseCode = require("../../../config/responseCode");
const connection = require("../../../config/connection");
const { default: axios } = require("axios");
const UploadController = require("../services/UploadController");
const fs = require("fs");
const path = require("path");
const Organizations = require("../../models/Organizations");
const Role = require("../../models/Role");
const Notification = require("../../models/Notification");
const { replaceTemplateDynamicVariable } = require("../services/EmailController");
const EmailController = require("../services/EmailController");

const systemCache = new NodeCache({
  stdTTL: 3600,
  checkperiod: configuration.login.otpValidation,
});

const environment = process.env.NODE_ENV || "development";
console.log("checking the environment", environment);

module.exports = {
  accountLoginStatus: async function (req, res, next) {
    try {
      let responseCode = returnCode.invalidSession;
      let user, receiverId;
      let notificationCount = 0;
      let userType = req.session.userType;
      let isSuperAdmin = req.session.isSuperAdmin;

      if (!UtilController.isEmpty(req.session.userId)) {
        responseCode = returnCode.validSession;
        receiverId = req.session.userId;

        if (!UtilController.isEmpty(req.query.fcmToken)) {
          await User.findByIdAndUpdate(req.session.userId, {
            fcmToken: req.query.fcmToken,
          });
        }

        user = await User.findById(req.session.userId)
          .select(
            "fname employeeId lname isSuperAdmin email mobileNo profileImage userType permission deliveryAddress gender organizationId dob isPasswordChange position",
          )
          .populate("permission")
          .lean();
        user.permission = module.exports.combinePermissions(user.permission);
        if (req.session.loginCount === 1) {
          let notificationData = {
            userId: new mongoose.Types.ObjectId(receiverId),
            senderId: new mongoose.Types.ObjectId(receiverId),
            organizationId: new mongoose.Types.ObjectId(req.session.organizationId),
            subject: "systemLogin",
            actionUrl: "/",
            loginAlertCount: 1,
            userType: req.session.userType === "Organization Admin" ? "organizationAdmin" : req.session.userType,
            data: {
              userName: user?.fname,
            },
          };
          await NotificationController.sendInAppNotification(notificationData);
          req.session.loginCount = 0;
        }
      }

      UtilController.sendSuccess(req, res, next, {
        responseCode,
        user,
        notificationCount,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
  combinePermissions: roles => {
    const combinedPermissions = {};
    console.log(roles);

    roles.forEach(role => {
      role.permission.forEach(permission => {
        const { label, enable, buttons } = permission;

        if (!combinedPermissions[label]) {
          combinedPermissions[label] = {
            label,
            enable: false,
            buttons: {},
          };
        }

        combinedPermissions[label].enable = combinedPermissions[label].enable || enable;

        buttons.forEach(button => {
          if (!combinedPermissions[label].buttons[button.label]) {
            combinedPermissions[label].buttons[button.label] = {
              label: button.label,
              enable: false,
            };
          }

          combinedPermissions[label].buttons[button.label].enable =
            combinedPermissions[label].buttons[button.label].enable || button.enable;
        });
      });
    });

    const permissionArray = Object.values(combinedPermissions).map((permission, index) => ({
      isParent: true,
      parentId: "",
      label: permission.label,
      enable: permission.enable,
      buttons: Object.values(permission.buttons).map((button, btnIndex) => ({
        label: button.label,
        enable: button.enable,
      })),
    }));

    console.log("permissionArray", permissionArray);

    return {
      _id: "combined_permission",
      active: true,
      name: "Combined Permissions",
      permission: permissionArray,
    };
  },
  accountLogin: async function (req, res, next) {
    try {
      let userCode = returnCode.validEmail;
      let emailId = req.body.email;
      let employeeId = req.body.employeeId ? req.body.employeeId.toString() : "";
      let password = req.body.password;
      const MAX_ATTEMPTS = 3;

      if (!UtilController.isEmpty(employeeId)) {
        let emailCheck = await User.findOne({
          employeeId: { $regex: new RegExp(`^${employeeId}$`, "i") },
          active: true,
        }).select("fname active mobileNo email userTag organizationId passwordAttempt emailVerified");

        userCode = UtilController.checkEmailStatus(emailCheck);
        req.session.userCode = userCode;

        if (userCode === returnCode.validEmail) {
          req.session.employeeId = employeeId;
        }
      }

      if (!UtilController.isEmpty(password)) {
        if (
          UtilController.isEmpty(req.session.employeeId) ||
          UtilController.isEmpty(req.session.userCode) ||
          req.session.userCode !== returnCode.validEmail
        ) {
          userCode = returnCode.invalidSession;
          if (!UtilController.isEmpty(req.session.userCode)) {
            userCode = req.session.userCode;
          }
        } else {
          let emailObj = await User.findOne({
            employeeId: { $regex: new RegExp(`^${req.session.employeeId}$`, "i") },
            active: true,
          }).select(
            "fname active email mobileNo userTag organizationId employeeId password passwordAttempt emailVerified userType areaId isSuperAdmin",
          );

          if (emailObj.passwordAttempt >= MAX_ATTEMPTS) {
            return UtilController.sendSuccess(req, res, next, {
              responseCode: returnCode.passwordAttemptsExceeded,
              remainingAttempts: 0,
              message: "Account locked due to multiple failed attempts",
            });
          }

          userCode = UtilController.comparePassword(emailObj.password, password, passwordSecretKey);
          if (userCode === returnCode.passwordMatched) {
            userCode = returnCode.validSession;
            systemCache.set(req.sessionID, emailObj._id, configuration.login.otpValidation);

            let userSes = systemCache.get(req.sessionID);
            if (userSes) {
              req.session.userId = emailObj?._id;
              let userResult = await User.findByIdAndUpdate(userSes, {
                lastLogin: Math.floor(Date.now() / 1000),
                passwordAttempt: 0,
              }).select("areaId userType organizationId isSuperAdmin");

              req.session.isSuperAdmin = userResult.isSuperAdmin;
              req.session.userId = userResult._id;
              req.session.userType = userResult.userType;
              req.session.loginCount = 1;

              if (!userResult?.isSuperAdmin) {
                req.session.organizationId = userResult.organizationId;
              }

              console.log("UserType", req.session);
              await User.findOneAndUpdate(
                {
                  userId: new mongoose.Types.ObjectId(req.session.userId),
                },
                {
                  passwordAttempt: 0,
                },
                { new: true },
              );
              systemCache.del(req.sessionID);
              req.session.save();
            }
          } else {
            // Increment attempt
            const updatedUser = await User.findOneAndUpdate(
              {
                employeeId: { $regex: new RegExp(`^${req.session.employeeId}$`, "i") },
              },
              {
                $inc: { passwordAttempt: 1 },
              },
              { new: true },
            );

            const attempts = updatedUser.passwordAttempt;
            const remainingAttempts = MAX_ATTEMPTS - attempts;

            // If exceeded
            if (attempts >= MAX_ATTEMPTS) {
              return UtilController.sendSuccess(req, res, next, {
                responseCode: returnCode.exceededpasswordAttempt,
                remainingAttempts: 0,
                message: "Password attempts exceeded",
              });
            }

            // Incorrect password
            return UtilController.sendSuccess(req, res, next, {
              responseCode: returnCode.passwordMismatch,
              remainingAttempts: remainingAttempts,
              message: "Incorrect password",
            });
          }
        }
      }

      return UtilController.sendSuccess(req, res, next, {
        responseCode: userCode,
      });
    } catch (err) {
      return UtilController.sendError(req, res, next, err);
    }
  },
  verifyOtp: async (req, res, next) => {
    try {
      let response = returnCode.invalidToken;
      let isPasswordChange = req.body.isPasswordChange ?? false;
      let userResult = {};
      if (Number(req.body.otpVal) === Number(req.session.otpVal)) {
        response = returnCode.validSession;
        let userSes = systemCache.get(req.sessionID);
        if (!(typeof userSes === "undefined" || userSes === null)) {
          req.session.userId = userSes;
          let userResult = await User.findByIdAndUpdate(userSes, {
            lastLogin: Math.floor(Date.now() / 1000),
            passwordAttempt: 0,
            isPasswordChange: isPasswordChange,
          }).select("areaId userType isSuperAdmin");

          req.session.isSuperAdmin = userResult.isSuperAdmin;
          req.session.userType = userResult.userType;
          //req.session.areaId=userResult.areaId;
          systemCache.del(req.sessionID);
        } else {
          response = returnCode.invalidToken;
        }
      }
      UtilController.sendSuccess(req, res, next, {
        responseCode: response,
        //user: userResult,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
  queryAllUser: async (req, res, next) => {
    try {
      let sortOrder = {};
      let startDate = req.body.startDate;
      let endDate = req.body.endDate;
      let userType = req.body.userType ?? "";
      let department = req.body.department;
      let domain = req.body.domain ?? "";
      let position = req.body.position ?? "";
      let createdBy = req.body.createdBy ?? "";
      let organizationId = req.body.organizationId || req.session.organizationId;
      let managerId = req.body.managerId;

      if (!UtilController.isEmpty(req.body.sortOrder) && !UtilController.isEmpty(req.body.sortField)) {
        sortOrder[req.body.sortField] = req.body.sortOrder === "false" ? -1 : 1;
      } else {
        sortOrder = {
          updatedAt: -1,
        };
      }

      let page = 0;
      let pageSize = 10;
      if (!UtilController.isEmpty(req.body.page) && !UtilController.isEmpty(req.body.pageSize)) {
        page = Number(req.body.page);
        pageSize = Number(req.body.pageSize);
      }

      let searchKey = req.body.keyword ?? "";

      const isArchiveView =
        req.body.archived === true ||
        String(req.body.archived || "").trim().toLowerCase() === "true" ||
        String(req.body.archived || "").trim().toLowerCase() === "yes";

      let matchStage = {
        active: req.body.active ?? true,
        // If archived field is missing in old docs, treat it as not archived.
        archived: isArchiveView ? true : { $ne: true },
        $or: [
          { fname: { $regex: searchKey, $options: "i" } },
          { lname: { $regex: searchKey, $options: "i" } },
          { mobileNo: { $regex: searchKey, $options: "i" } },
          { email: { $regex: searchKey, $options: "i" } },
          { employeeId: { $regex: searchKey, $options: "i" } },
        ],
      };

      // When viewing archived users, don't restrict by active flag (show both active/inactive archived users)
      if (isArchiveView) {
        delete matchStage.active;
      }

      if (!UtilController.isEmpty(req.body.userType) && req.body.userType !== "all") {
        matchStage["userType"] = { $regex: userType, $options: "i" };
        if (Array.isArray(userType) && userType.length > 0) {
          const regexUserTypes = userType.map(type => new RegExp(type, "i"));
          matchStage["userType"] = { $in: regexUserTypes };
        }
      }

      if (!UtilController.isEmpty(req.body.status) && req.body.status != "all") {
        matchStage["status"] = req.body.status;
      }
      if (!UtilController.isEmpty(position)) {
        matchStage["position"] = { $regex: position, $options: "i" };
      }
      // if (!UtilController.isEmpty(department)) {
      //   matchStage["department"] = { $regex: department, $options: "i" };
      // }
      if (!UtilController.isEmpty(req.body.organizationId) && UtilController.isEmpty(organizationId)) {
        matchStage["organizationId"] = new mongoose.Types.ObjectId(req.body.organizationId);
      }
      if (!UtilController.isEmpty(organizationId)) {
        matchStage["organizationId"] = new mongoose.Types.ObjectId(organizationId);
      }
      // if (!UtilController.isEmpty(managerId)) {
      //   matchStage["reportedTo"] = new mongoose.Types.ObjectId(managerId);
      // }
      if (!UtilController.isEmpty(managerId)) {
        matchStage["reportedTo"] = managerId;
      }
      if (!UtilController.isEmpty(createdBy)) {
        matchStage["createdBy"] = new mongoose.Types.ObjectId(createdBy);
      }
      if (!UtilController.isEmpty(req.body.domain)) {
        matchStage["domain"] = { $regex: domain, $options: "i" };
      }
      if (!UtilController.isEmpty(req.body.departmentId)) {
        matchStage["departmentId"] = { $regex: req.body.departmentId, $options: "i" };
      }
      if (!UtilController.isEmpty(startDate) && !UtilController.isEmpty(endDate)) {
        matchStage["$and"] = [{ createdAt: { $gte: parseInt(startDate) } }, { createdAt: { $lte: parseInt(endDate) } }];
      }

      if (req.body.userType === "all") {
        delete matchStage.userType;
      }

      // if (req.body.active === "all" || UtilController.isEmpty(req.body.active)) {
      //   delete matchStage.active;
      // }
      const rp = req.body.reportedTo;

      console.log("rp ty", typeof rp);
      if (typeof rp == "object") {
        if (rp.length > 0) {
          matchStage["reportedTo"] = { $in: rp };
        }
      }

      if (!UtilController.isEmpty(req.body.reportedTo) && req.body.userType?.toLowerCase() === "employee") {
        //matchStage["reportedTo"] = req.body.reportedTo;
        matchStage["userType"] = req.body.userType;
      }

      let totalCountPipeline = [{ $match: matchStage }, { $count: "count" }];
      let totalCountResult = await User.aggregate(totalCountPipeline);
      let totalCount = totalCountResult[0]?.count ?? 0;
      console.log(JSON.stringify(matchStage));

      let pipeline = [
        { $match: matchStage },

        // Lookup for departmentId
        // {
        //   $lookup: {
        //     from: "departments",
        //     localField: "departmentId",
        //     foreignField: "_id",
        //     as: "departmentDetails",
        //   },
        // },
        {
          $lookup: {
            from: "departments",
            localField: "departmentId",
            foreignField: "departmentId",
            as: "departmentDetails",
          },
        },
        {
          $unwind: {
            path: "$departmentDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "createdBy",
            foreignField: "_id",
            as: "createdByDetails",
          },
        },
        {
          $unwind: {
            path: "$createdByDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "operatedBy",
            foreignField: "_id",
            as: "operatedByDetails",
          },
        },
        {
          $unwind: {
            path: "$operatedByDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "users",
            let: { reportedToField: "$reportedTo" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $ne: ["$$reportedToField", null] },
                      { $ne: ["$$reportedToField", ""] },
                      { $eq: ["$employeeId", "$$reportedToField"] },
                    ],
                  },
                },
              },
            ],
            as: "reportingManagerDetails",
          },
        },
        {
          $unwind: {
            path: "$reportingManagerDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "roles",
            localField: "permission",
            foreignField: "_id",
            as: "roleDetails",
          },
        },
        {
          $project: {
            _id: "$_id",
            fname: "$fname",
            lname: "$lname",
            email: "$email",
            userId: "$userId",
            mobileNo: "$mobileNo",
            userType: "$userType",
            employeeId: "$employeeId",
            status: "$status",
            isSuperAdmin: "$isSuperAdmin",
            position: "$position",
            active: "$active",
            archived: "$archived",
            dateOfJoining: "$dateOfJoining",
            dob: "$dob",
            totalExp: "$totalExp",
            updatedAt: "$updatedAt",
            createdAt: "$createdAt",
            createdBy: {
              $concat: [
                { $ifNull: ["$createdByDetails.fname", ""] },
                " ",
                { $ifNull: ["$createdByDetails.lname", ""] },
              ],
            },
            createdById: "$createdByDetails._id",
            createdByProfileImage: {
              $let: {
                vars: {
                  profileImage: {
                    $trim: {
                      input: { $ifNull: ["$createdByDetails.profileImage", ""] },
                    },
                  },
                  profileImageUrl: {
                    $trim: {
                      input: { $ifNull: ["$createdByDetails.profileImageUrl", ""] },
                    },
                  },
                },
                in: {
                  $cond: [
                    { $ne: ["$$profileImage", ""] },
                    "$$profileImage",
                    {
                      $cond: [
                        { $ne: ["$$profileImageUrl", ""] },
                        "$$profileImageUrl",
                        "",
                      ],
                    },
                  ],
                },
              },
            },
            reportingManager: {
              $concat: [
                { $ifNull: ["$reportingManagerDetails.fname", ""] },
                " ",
                { $ifNull: ["$reportingManagerDetails.lname", ""] },
              ],
            },
            fragmentedAddress: "$fragmentedAddress",
            profileImage: "$profileImage",
            domain: "$domain",
            organizationName: "$organizationName",
            operatedBy: {
              $concat: [
                { $ifNull: ["$operatedByDetails.fname", ""] },
                " ",
                { $ifNull: ["$operatedByDetails.lname", ""] },
              ],
            },
            operatedById: "$operatedByDetails._id",
            operatedByProfileImage: {
              $let: {
                vars: {
                  profileImage: {
                    $trim: {
                      input: { $ifNull: ["$operatedByDetails.profileImage", ""] },
                    },
                  },
                  profileImageUrl: {
                    $trim: {
                      input: { $ifNull: ["$operatedByDetails.profileImageUrl", ""] },
                    },
                  },
                },
                in: {
                  $cond: [
                    { $ne: ["$$profileImage", ""] },
                    "$$profileImage",
                    {
                      $cond: [
                        { $ne: ["$$profileImageUrl", ""] },
                        "$$profileImageUrl",
                        "",
                      ],
                    },
                  ],
                },
              },
            },
            roleName: "$roleDetails.name",
            departmentName: "$departmentDetails.name",
            departmentId: "$departmentId",
          },
        },

        { $sort: sortOrder },
        { $skip: page * pageSize },
        { $limit: pageSize },
      ];

      let result = await User.aggregate(pipeline);

      UtilController.sendSuccess(req, res, next, {
        result: result,
        pages: Math.ceil(totalCount / pageSize),
        filterRecords: totalCount,
      });
    } catch (err) {
      console.error(err);
      UtilController.sendError(req, res, next, err);
    }
  },

  createUser: async (req, res, next) => {
    try {
      let createObj = req.body;
      createObj["emailVerified"] = true;
      let organizationId = req.session.organizationId ?? req.body.organizationId;
      let organization = null;

      if (createObj.userType === "Admin") {
        if (!createObj.organizationId) delete createObj.organizationId;
        if (!createObj.departmentId) delete createObj.departmentId;
        if (!createObj.isDepartmentHead) delete createObj.isDepartmentHead;
        if (!createObj.alternativeNo) delete createObj.alternativeNo;
      }
      let existingUser = await User.findOne({
        $or: [{ mobileNo: createObj.mobileNo }, { email: createObj.email }],
        active: true,
      });

      if (existingUser) {
        if (existingUser.mobileNo === createObj.mobileNo) {
          return UtilController.sendSuccess(req, res, next, {
            responseCode: returnCode.duplicate,
            message: "Mobile number already exists.",
          });
        }

        if (existingUser.email === createObj.email) {
          return UtilController.sendSuccess(req, res, next, {
            responseCode: returnCode.duplicate,
            message: "Email already exists.",
          });
        }
      }

      if (UtilController.isEmpty(createObj.permission)) {
        delete createObj.permission;
      }

      createObj["status"] = "approved";
      createObj["createdBy"] = req.session.userId;
      createObj["createdAt"] = Math.floor(Date.now() / 1000);

      if (!UtilController.isEmpty(organizationId)) {
        createObj["organizationId"] = organizationId;

        organization = await Organizations.findById(organizationId).select(
          "organizationName employeePrefix employeeSequenceNo _id",
        );

        if (!UtilController.isEmpty(organization)) {
          const updatedOrg = await Organizations.findByIdAndUpdate(
            organizationId,
            {
              $inc: { employeeSequenceNo: 1 },
              updatedAt: Math.floor(Date.now() / 1000),
            },
            { new: true },
          );

          createObj["organizationName"] = updatedOrg.organizationName;

          if (!UtilController.isEmpty(updatedOrg.employeePrefix)) {
            createObj["employeeId"] =
              updatedOrg.employeePrefix + UtilController.pad(updatedOrg.employeeSequenceNo ?? 0, 4);
            console.log(`if createObj["employeeId"]`, createObj["employeeId"]);
          }
        }
      } else {
        let tagResult = await Tag.findOneAndUpdate(
          {
            active: true,
            tagType: "users",
          },
          {
            $inc: { sequenceNo: 1 },
            updatedAt: Math.floor(Date.now() / 1000),
          },
          { new: true },
        );

        if (!tagResult || !tagResult.prefix) {
          throw new Error("Failed to generate Employee ID: Tag configuration is invalid.");
        }

        createObj["employeeId"] = tagResult.prefix + UtilController.pad(tagResult.sequenceNo ?? 0, 4);
        console.log(`ele createObj["employeeId"]`, createObj["employeeId"]);
      }

      let userPassword = "admin123";

      if (!UtilController.isEmpty(req.body.password)) {
        userPassword = req.body.password;
      }

      createObj["operatedBy"] = req.session.userId;
      var ciphertext = CryptoJS.AES.encrypt(userPassword, passwordSecretKey);
      createObj["password"] = ciphertext.toString();

      const result = await User.create(createObj);

      const sessionHash = crypto.randomBytes(32).toString("hex");
      const combinedToken = `${result?.employeeId}:${sessionHash}`;
      const token = Buffer.from(combinedToken).toString("base64");
      let emailData = {
        toAddresses: [{ email: result?.email, name: `${result.fname} ${result?.lname}` }],
        subject: "Welcome to SPMS! Here’s how to get started",
        html: `
        <div>
          <h2>Welcome ${result.fname} ${result.lname}</h2>
          <p>Your account has been successfully created.</p>
          <p><strong>EmployeeId:</strong> ${result?.employeeId}</p>
          <p><strong>Temporary Password:</strong> ${userPassword}</p>
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
        body: `A new user has joined the organization ${organization?.organizationName}. Click to view their details`,
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
        body: `A new user ${result.fname} has been successfully created. Click to manage their profile`,
        type: "system",
        read: false,
        visibleOnHome: true,
        actionUrl: `/users?id=${result._id}`,
        recordId: result._id,
        userType: "organizationAdmin",
      });

      if (!UtilController.isEmpty(createObj.permission) && Array.isArray(createObj.permission)) {
        for (const permissionId of createObj.permission) {
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

      UtilController.sendSuccess(req, res, next, {});
    } catch (err) {
      console.log("Error during user creation:", err);

      if (err.code === 11000) {
        let errorMessage = "Duplicate key error";
        let responseCode = returnCode.duplicate;

        return UtilController.sendSuccess(req, res, next, {
          message: errorMessage,
          responseCode: responseCode,
          // data: err,
        });
      }

      UtilController.sendError(req, res, next, err);
    }
  },

  getUserById: async (req, res, next) => {
    try {
      let recordId = req.body.recordId;
      let pipeline = [
        {
          $match: {
            _id: mongoose.Types.ObjectId(recordId),
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "reportedTo",
            foreignField: "employeeId",
            as: "reportingManagerDetails",
          },
        },
        {
          $unwind: {
            path: "$reportingManagerDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "departments",
            localField: "departmentId",
            foreignField: "departmentId",
            as: "departmentDetails",
          },
        },
        {
          $unwind: {
            path: "$reportingManagerDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "roles",
            localField: "permission",
            foreignField: "_id",
            as: "permission",
            pipeline: [
              {
                $project: {
                  _id: 1,
                  name: 1,
                },
              },
            ],
          },
        },
      ];
      let user = await User.aggregate(pipeline);
      if (!UtilController.isEmpty(user)) {
        let passwordHash = user?.[0]?.password;
        let decryptedPwd = UtilController.decryptData(passwordHash, passwordSecretKey);
        user[0].password = decryptedPwd;
      }

      UtilController.sendSuccess(req, res, next, {
        result: user?.[0],
      });
    } catch (err) {
      console.error(err);
      UtilController.sendError(req, res, next, err);
    }
  },
  resendOtp: async (req, res, next) => {
    try {
      console.log("reaching");
      let userSes = systemCache.get(req.sessionID);
      if (!(typeof userSes === "undefined" || userSes === null)) {
        let userObj = await User.findById(userSes).select("name active email mobileNo userTag emailVerified");
        await module.exports.sendOtp(req, userObj);
      } else {
        response = returnCode.invalidToken;
      }
      UtilController.sendSuccess(req, res, next, {
        responseCode: response,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
  sendOtp: async (req, userObj) => {
    try {
      let otpVal = UtilController.getOTP(userObj);
      req.session.otpVal = otpVal;
      NotificationController.sendUserOtp({
        mobileNo: userObj.mobileNo,
        email: userObj.email,
        otp: otpVal,
        data: {
          otp: otpVal,
          userName: userObj.fname,
        },
      });
    } catch (err) {
      console.error(err);
    }
  },
  accountLogout: async function (req, res, next) {
    try {
      if (!UtilController.isEmpty(req.session.userId)) {
        await Notification.deleteOne({
          userId: new mongoose.Types.ObjectId(req.session.userId),
          type: "systemLogin",
        });
        req.session.destroy();
      }
      UtilController.sendSuccess(req, res, next, {
        message: "user account is logout successfully",
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
  updateUser: async (req, res, next) => {
    try {
      const { recordId, email, mobileNo, status, password, ...updateObj } = req.body;

      if (!UtilController.isEmpty(mobileNo)) {
        updateObj.mobileNo = mobileNo;
      }
      if (!UtilController.isEmpty(email)) {
        updateObj.email = email;
      }

      updateObj.updatedBy = req.session.userId;
      updateObj.operatedBy = req.session.userId;
      updateObj.updatedAt = Math.floor(Date.now() / 1000);

      const user = await User.findById(recordId);
      if (!user) {
        return UtilController.sendError(req, res, next, {
          responseCode: returnCode.recordNotFound,
          message: "User not found",
        });
      }

      // Check for duplicate email,, and mobileNo in other users
      const existingUser = await User.findOne({
        _id: { $ne: recordId },
        active: true,
        $or: [{ email: updateObj.email }, { mobileNo: updateObj.mobileNo }],
      });

      if (existingUser) {
        if (existingUser.email === updateObj.email) {
          return UtilController.sendError(req, res, next, {
            responseCode: returnCode.duplicate,
            message: "Email already exists.",
          });
        }

        if (existingUser.mobileNo === updateObj.mobileNo) {
          return UtilController.sendError(req, res, next, {
            responseCode: returnCode.duplicate,
            message: "Mobile number already exists.",
          });
        }
      }

      if (!UtilController.isEmpty(status) && UtilController.isEmpty(user.userId)) {
        const tagResult = await Tag.findOneAndUpdate(
          { active: true, tagType: "users" },
          { $inc: { sequenceNo: 1 }, updatedAt: updateObj.updatedAt },
          { new: true },
        );
        updateObj.userId = tagResult.prefix + UtilController.pad(tagResult.sequenceNo, 5);
      }

      if (!UtilController.isEmpty(password) && password !== user.password) {
        updateObj.password = CryptoJS.AES.encrypt(password, passwordSecretKey).toString();
      }

      const updatedUser = await User.findByIdAndUpdate(recordId, updateObj, {
        new: true,
      })
        .select("-id")
        .populate([
          { path: "createdBy", select: "fname lname" },
          { path: "operatedBy", select: "fname lname" },
        ]);

      if (!UtilController.isEmpty(updatedUser.permission) && Array.isArray(updatedUser.permission)) {
        for (const permissionId of updatedUser.permission) {
          const roleId = mongoose.Types.ObjectId(permissionId);

          await Role.findByIdAndUpdate(
            roleId,
            {
              $addToSet: { owner: updatedUser._id }, // Add to 'owner' array if not already present
              updatedAt: Math.floor(Date.now() / 1000),
            },
            { new: true },
          );
        }
      }

      return UtilController.sendSuccess(req, res, next, {
        user: updatedUser,
        message: "User updated successfully",
        responseCode: returnCode.validSession,
      });
    } catch (err) {
      if (err.code === 11000) {
        let errorMessage = "Duplicate key error";
        if (err.keyPattern.email) {
          errorMessage = `Email already exists: ${err.keyValue.email}`;
        } else if (err.keyPattern.mobileNo) {
          errorMessage = `Mobile number already exists: ${err.keyValue.mobileNo}`;
        }
        return UtilController.sendError(req, res, next, {
          message: errorMessage,
          code: returnCode.duplicate,
          data: err,
        });
      }

      UtilController.sendError(req, res, next, err);
    }
  },

  resetPassword: async (req, res, next) => {
    try {
      let oldPassword = req.body.oldPassword;
      let userCode = returnCode.passwordMismatch;
      let encriptedNewPsw = CryptoJS.AES.encrypt(req.body.password, passwordSecretKey);
      let encriptedNewPassword = encriptedNewPsw.toString();
      let userEmailObj = await User.findById(req.session.userId).select("name active email password");
      userCode = UtilController.comparePassword(userEmailObj.password, oldPassword, passwordSecretKey);
      if (userCode === returnCode.passwordMatched) {
        await User.findByIdAndUpdate(req.session.userId, {
          password: encriptedNewPassword,
        });
      }

      UtilController.sendSuccess(req, res, next, {
        responseCode: returnCode.validSession,
        message: "User password reset is done successfully",
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
  deleteUser: async (req, res, next) => {
    try {
      const { recordIds } = req.body; // Accept an array of record IDs

      if (!Array.isArray(recordIds) || recordIds.length === 0) {
        return UtilController.sendError(req, res, next, {
          message: "An array of valid record IDs is required",
          responseCode: returnCode.incompleteBody,
        });
      }

      await User.updateMany(
        {
          _id: { $in: recordIds }, // Match all record IDs in the array
        },
        {
          active: false,
          archived: true,
          updatedAt: Math.floor(Date.now() / 1000), // Update timestamp
        },
      );

      return UtilController.sendSuccess(req, res, next, {
        message: "User(s) deleted successfully",
      });
    } catch (err) {
      return UtilController.sendError(req, res, next, err);
    }
  },

  resetPasswordAttempt: async (req, res, next) => {
    try {
      console.log("resetPasswordAttempt");
      await User.findByIdAndUpdate(req.body.userId, {
        passwordAttempt: 0,
        updatedAt: Math.floor(Date.now() / 1000),
      });
      UtilController.sendSuccess(req, res, next, {
        message: "User passwordAttempt reset is done successfully",
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
  generatePassword: async (req, res, next) => {
    try {
      let token = req.query.token.trim();

      let emailObj = systemCache.get(token);
      let newPassword = Math.random().toString(36).slice(-8);
      let encriptedNewPsw = CryptoJS.AES.encrypt(newPassword, passwordSecretKey);
      let encriptedNewPassword = encriptedNewPsw.toString();
      let response = returnCode.invalidToken;
      if (!(typeof emailObj === "undefined" || emailObj === null)) {
        await User.findOneAndUpdate(
          {
            userName: emailObj.userName,
          },
          {
            password: encriptedNewPassword,
          },
        );

        response = returnCode.newPasswordGenerated;
        NotificationController.generatedPassword({
          emailId: emailObj.email,
          password: newPassword,
          receiverName: emailObj.receiverName,
          userType: emailObj.userType,
        });
        systemCache.del(token);
      }

      UtilController.sendSuccess(req, res, next, {
        responseCode: response,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
  sendCustomEmail: async function (userEmails, subject, emailbody) {
    try {
      for (let i = 0; i < userEmails.length; i++) {
        let cntVal = await User.find({
          email: userEmails[i],
          active: true,
          subscribe: true,
        }).select("name email");
        if (cntVal !== undefined && cntVal.length > 0) {
          NotificationController.userCustomEmail({
            userId: cntVal[0]._id,
            emailId: cntVal[0].email,
            subject: subject,
            emailbody: emailbody,
          });
        }
      }
    } catch (err) {
      console.error(err);
    }
  },

  listUploadedFiles: async (req, res, next) => {
    try {
      let { operationType, page = 0, pageSize = 10 } = req.body;
      let organizationId = req.session.organizationId;

      let queryObj = {
        active: true,
        operationType,
      };

      if (!UtilController.isEmpty(organizationId)) {
        queryObj["organizationId"] = organizationId;
      }

      let totalRecords = await DataFileUpload.countDocuments(queryObj);

      let result = await DataFileUpload.find(queryObj)
        .populate({
          path: "uploadedBy",
          select: "fname lname email mobileNo",
        })
        .populate({
          path: "operatedBy",
          select: "fname lname email mobileNo",
        })
        .sort({ createdAt: -1 })
        .skip(page * pageSize)
        .limit(pageSize);

      // Transform results to include full name
      result = result.map(item => ({
        ...item.toObject(),
        uploadedBy: item?.uploadedBy ? `${item.uploadedBy.fname} ${item.uploadedBy.lname}` : "",
      }));

      // Send response with pagination details
      UtilController.sendSuccess(req, res, next, {
        totalRecords,
        totalPages: Math.ceil(totalRecords / pageSize),
        currentPage: page,
        pageSize,
        result,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },

  rowcount: async (req, res, next) => {
    try {
      const { processedFilePath } = req.body; // Assuming the file URL is passed

      // Download the file
      const response = await axios.get(processedFilePath, { responseType: "arraybuffer" });

      // Save the file temporarily on the server
      const tempFilePath = path.join(__dirname, "tempFile.xlsx");
      fs.writeFileSync(tempFilePath, response.data);

      // Read the Excel file
      const workbook = XLSX.readFile(tempFilePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      // Convert the sheet to a JSON array, ignoring the first row (header row)
      const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      // Row count excluding the header
      const rowCount = jsonData.length - 1; // Subtract 1 to exclude the header row

      // Clean up the temporary file
      fs.unlinkSync(tempFilePath);

      // Return the row count in the response
      res.json({ rowCount });
    } catch (error) {
      console.error("Error reading Excel file:", error);
      res.status(500).json({ error: "Failed to process Excel file" });
    }
  },

  queryAllState: async (req, res, next) => {
    try {
      let page = 0;
      let pageSize = 10;
      if (!UtilController.isEmpty(req.body.page) && !UtilController.isEmpty(req.body.pageSize)) {
        page = Number(req.body.page);
        pageSize = Number(req.body.pageSize);
      }
      let queryObj = {
        state_name_english: {
          $regex: req.body.state ?? "",
          $options: "i",
        },
      };
      let states = await State.find(queryObj)
        .skip(page * pageSize)
        .limit(pageSize);

      let pageCount = await State.countDocuments(queryObj);

      UtilController.sendSuccess(req, res, next, {
        result: states,
        pages: Math.ceil(pageCount / req.body.pageSize),
        filterRecords: pageCount,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
  queryAllDistricts: async (req, res, next) => {
    console.log("1111");
    try {
      let page = 0;
      let pageSize = 10;
      if (!UtilController.isEmpty(req.body.page) && !UtilController.isEmpty(req.body.pageSize)) {
        page = Number(req.body.page);
        pageSize = Number(req.body.pageSize);
      }
      let queryObj = {
        state_name_english: {
          $regex: req.body.state ?? "",
          $options: "i",
        },
        district_name_english: {
          $regex: req.body.district ?? "",
          $options: "i",
        },
      };
      let districts = await District.find(queryObj)
        .skip(page * pageSize)
        .limit(pageSize);
      let pageCount = await District.countDocuments(queryObj);
      UtilController.sendSuccess(req, res, next, {
        result: districts,
        pages: Math.ceil(pageCount / req.body.pageSize),
        filterRecords: pageCount,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
  forgotPasswordOtp: async (req, res, next) => {
    try {
      let userCode = returnCode.validEmail;
      // let passwordChanged = req.body.isPasswordChange;
      // console.log(passwordChanged, "from passwordChanged");

      let userName = req.body?.mobileNo?.trim();
      console.log(userName, "from userName");
      // let password = req.body?.password;

      if (UtilController.isEmpty(userName)) {
        return UtilController.sendSuccess(req, res, next, {
          responseCode: returnCode.emailNotFound,
        });
      }

      let checkUser = await User.findOne({
        userName,
        active: true,
        // userType: { $in: ["user"] },
      })
        .select(
          "fname active mobileNo email password isSuperAdmin userType tagId passwordAttempt emailVerified isPasswordChange",
        )
        .lean();
      console.log(checkUser, "from checkuser");
      userCode = UtilController.checkEmailStatus(checkUser);
      console.log(userCode, "from userCode");

      if (userCode !== returnCode.validEmail) {
        return UtilController.sendSuccess(req, res, next, {
          responseCode: userCode,
        });
      }

      let optResp = "";
      if (configuration.login["2FactorAuthentication"]) {
        userCode = returnCode["2FactorEnabled"];
        systemCache.set(req.sessionID, checkUser._id, configuration.login.otpValidation); // 10 minute time
        //otp
        optResp = await module.exports.sendOtp(req, checkUser);
        req.session.isForgotPassword = true;
      }

      UtilController.sendSuccess(req, res, next, {
        responseCode: userCode,
      });
    } catch (error) {
      console.log(error);
      UtilController.sendError(req, res, next, error);
    }
  },
  updatePassword: async function (req, res, next) {
    try {
      let updateObj = {};
      let userId = req.session.userId;
      updateObj["updatedAt"] = Math.floor(Date.now() / 1000);
      let usrResult = await User.findOne({
        _id: mongoose.Types.ObjectId(userId),
      });
      if (
        req.body.password !== undefined &&
        req.body.password !== null &&
        req.body.password !== "" &&
        req.body.password !== usrResult.password
      ) {
        let userPassword = req.body.password;
        var ciphertext = CryptoJS.AES.encrypt(userPassword, passwordSecretKey);
        updateObj["password"] = ciphertext.toString();
      } else {
        delete updateObj.password;
      }
      usrResult = await User.findByIdAndUpdate(
        {
          _id: mongoose.Types.ObjectId(userId),
        },
        updateObj,
      ).select("-id");
      delete req.session.isForgotPassword;
      delete req.session.userId;
      UtilController.sendSuccess(req, res, next, {});
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
  restoreUser: async (req, res, next) => {
    try {
      let recordId = req.body.recordId;
      let queryObj = {
        _id: { $in: recordId },
      };
      let updateObj = { active: true, archived: false };
      updateObj["updatedAt"] = Math.floor(Date.now() / 1000);
      updateObj["operatedBy"] = req.user?.userId;
      await User.updateMany(queryObj, updateObj);
      UtilController.sendSuccess(req, res, next, {});
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
  inactivateUser: async (req, res, next) => {
    try {
      let recordId = req.body.recordId;
      let queryObj = {
        _id: { $in: recordId },
      };
      let updateObj = { active: false, archived: false };
      updateObj["updatedAt"] = Math.floor(Date.now() / 1000);
      updateObj["operatedBy"] = req.user?.userId;
      await User.updateMany(queryObj, updateObj);
      UtilController.sendSuccess(req, res, next, {});
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
  //below is the api for bulk upload

  uploadBulkUsers: async (req, res, next) => {
    try {
      let fileupload = req.body;
      let organizationId = req.session.organizationId;

      if (!UtilController.isEmpty(organizationId)) {
        delete fileupload.organizationId;
        fileupload["organizationId"] = organizationId;
      } else {
        organizationId =
          req.body?.organizationId ||
          req.body?.organizationID ||
          req.body?.organization_id ||
          (Array.isArray(req.body?.organizationId) ? req.body.organizationId[0] : undefined);
      }

      fileupload["userId"] = req.body.userId;
      fileupload["createdBy"] = req.session.userId;
      fileupload["operatedBy"] = req.session.userId;
      fileupload["uploadedBy"] = req.session.userId;
      fileupload["organizationId"] = organizationId;
      fileupload["status"] = "inprocess";
      fileupload["collectionName"] = "users";
      fileupload["operationType"] = "uploadBulkUsers";
      fileupload["trackId"] = Math.random().toString(36).slice(-8).toUpperCase();

      const folderName = req.body.folderName || "uploads";

      if (UtilController.isEmpty(fileupload.organizationId)) {
        return UtilController.sendError(req, res, next, {
          message: "Organization Id is required",
          responseCode: returnCode.incompleteBody,
        });
      }

      if (!req.files || !req.files.attachment) {
        return res.status(400).json({ error: "No files were uploaded." });
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
        const newFileName = uniqueSuffix + "-" + file.originalname;
        newPath = path.join(uploadDir, newFileName);

        fs.copyFileSync(file.path, newPath);

        const fileUrl = `${req.protocol}://${req.get("host")}/public/uploads/${folderName}/${newFileName}`;
        fileLinks.push(fileUrl);
      }

      fileupload["uploadedFilePath"] = fileLinks[0];
      let response = await DataFileUpload.create(fileupload);

      const localPath = newPath;
      const result = await UploadedDatafileProcessing.processFile(
        response,
        localPath,
        req.body.userId,
        req,
        organizationId,
      );
      // if (result?.errorDetails?.length > 0) {
      //   UtilController.sendError(req, res, next, {
      //     message: "Failed to upload file",
      //     result,
      //   });
      //   return;
      // }

      UtilController.sendSuccess(req, res, next, {
        message: "File(s) uploaded successfully!",
        successCount: result.result?.successCount,
        failCount: result.result?.failCount,
        result: result,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },

  // API to get all users for dropdown selection with search keyword
  queryCreatedByUsers: async (req, res, next) => {
    try {
      const { keyword } = req.query;
      const { organizationId } = req.session;

      const pipeline = [
        {
          $lookup: {
            from: "users",
            localField: "createdBy",
            foreignField: "_id",
            as: "createdByUser",
          },
        },
        {
          $unwind: {
            path: "$createdByUser",
            preserveNullAndEmptyArrays: false,
          },
        },

        {
          $match: {
            organizationId: mongoose.Types.ObjectId(organizationId),
          },
        },
        {
          $group: {
            _id: "$createdByUser._id",
            fname: { $first: "$createdByUser.fname" },
            lname: { $first: "$createdByUser.lname" },
          },
        },

        ...(keyword
          ? [
              {
                $match: {
                  $or: [{ fname: { $regex: keyword, $options: "i" } }, { lname: { $regex: keyword, $options: "i" } }],
                },
              },
            ]
          : []),
        {
          $sort: { fname: 1 },
        },
        {
          $project: {
            _id: 1,
            fname: 1,
            lname: 1,
          },
        },
      ];

      let result = await User.aggregate(pipeline);

      UtilController.sendSuccess(req, res, next, {
        result,
      });
    } catch (err) {
      console.error(err);
      UtilController.sendError(req, res, next, err);
    }
  },
  forgotPasswordVerificationLink: async (req, res, next) => {
    try {
      const { employeeId } = req.body;

      if (UtilController.isEmpty(employeeId)) {
        return UtilController.sendError(req, res, next, {
          message: "Invalid or missing Employee Id.",
        });
      }

      const lastResetRequest = req.session.lastResetRequest || 0;
      const currentTime = Date.now();
      const timeSinceLastRequest = currentTime - lastResetRequest;

      if (timeSinceLastRequest < 300000) {
        return UtilController.sendError(req, res, next, {
          message: "You have already requested a password reset recently. Please try again later.",
          responseCode: returnCode.notAvailable,
        });
      }

      const user = await User.findOne({
        employeeId: { $regex: employeeId.trim(), $options: "i" },
        active: true,
      })
        .select("_id fname lname email employeeId")
        .lean();

      if (!user) {
        return UtilController.sendError(req, res, next, {
          message: "User not found or inactive.",
          responseCode: returnCode.emailNotFound,
        });
      }

      // Generate session token
      const sessionHash = crypto.randomBytes(32).toString("hex");
      const combinedToken = `${user?.employeeId}:${sessionHash}`;
      const token = Buffer.from(combinedToken).toString("base64");

      // Generate a secure temporary password
      const tempPassword = crypto
        .randomBytes(6)
        .toString("base64")
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 8);

      // req.session.verificationTokenHash = token;
      // req.session.userId = user._id;
      // req.session.isVerified = false;
      req.session.tokenExpiration = moment().add(10, "minutes").toDate();
      req.session.lastResetRequest = currentTime;

      const frontendResetUrl = `${awsConfig.configUserUrl.forgotPasswordUrl}?token=${token}`;

      const emailData = {
        toAddresses: [
          {
            email: user.email,
            name: `${user.fname} ${user.lname}`,
          },
        ],
        subject: "Password Reset Request",
        html: `
       <p>Hello ${user.fname},</p>
        <p>You requested to reset your password. Click the link below to verify your account and set a new password:</p>
        <p><a href="${frontendResetUrl}" style="color: blue; text-decoration: underline;">Verify and Reset Password</a></p>
        <p>Your EmployeeId is: <b>${user?.employeeId}</b></p>
        <p>Your temporary password is: <b>${tempPassword}</b></p>
        <p>Please note: You will need to reset your password after logging in with this temporary password.</p>
        <p>If you didn’t request this, please ignore this email.</p>
        <p>Thanks,<br>Team USICA</p>

      `,
      };

      // Update the user with the temporary password (hashed)
      var ciphertext = CryptoJS.AES.encrypt(tempPassword, passwordSecretKey);
      const hashedTempPassword = ciphertext.toString();
      console.log(hashedTempPassword);
      await User.updateOne({ _id: user._id }, { $set: { password: hashedTempPassword } });

      await EmailController.sendCustomMail(emailData);

      UtilController.sendSuccess(req, res, next, {
        message: "Verification email with temporary password sent successfully.",
      });
    } catch (error) {
      console.error("Error in verifyAndSendEmail:", error);
      UtilController.sendError(req, res, next, error);
    }
  },

  verifySessionToken: async (req, res, next) => {
    try {
      const { token } = req.body;

      if (UtilController.isEmpty(token)) {
        return UtilController.sendError(req, res, next, {
          message: "Invalid token or session expired",
        });
      }

      const decodedToken = Buffer.from(token, "base64").toString("utf-8");
      const [employeeId, sessionHash] = decodedToken.split(":");
      if (!employeeId || !sessionHash) {
        return UtilController.sendError(req, res, next, {
          message: "Invalid token format",
        });
      }
      let queryObj = {
        employeeId: { $regex: employeeId, $options: "i" },
        active: true,
      };

      let emailCheck = await User.findOne(queryObj).select(
        "fname active mobileNo email userTag organizationId passwordAttempt emailVerified",
      );

      let userCode = UtilController.checkEmailStatus(emailCheck);
      req.session.userCode = userCode;

      if (userCode === returnCode.validEmail) {
        req.session.employeeId = employeeId;
      }

      let emailObj = await User.findOne(queryObj).select(
        "fname active email mobileNo userTag organizationId password passwordAttempt emailVerified userType areaId isSuperAdmin",
      );

      userCode = returnCode.validSession;
      systemCache.set(req.sessionID, emailObj._id, configuration.login.otpValidation);

      let userSes = systemCache.get(req.sessionID);
      if (!(typeof userSes === "undefined" || userSes === null)) {
        req.session.userId = emailObj._id;
        let userResult = await User.findByIdAndUpdate(userSes, {
          lastLogin: Math.floor(Date.now() / 1000),
          passwordAttempt: 0,
        }).select("areaId userType organizationId isSuperAdmin");

        req.session.isSuperAdmin = userResult.isSuperAdmin;
        req.session.userId = userResult._id;
        req.session.userType = userResult.userType;

        if (!userResult.isSuperAdmin) {
          req.session.organizationId = userResult.organizationId;
        }

        systemCache.del(req.sessionID);
        req.session.save();
      }

      req.session.isVerified = true;
      UtilController.sendSuccess(req, res, next, {
        responseCode: returnCode.validSession,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, {
        message: "An error occurred during the session verification process.",
        error: err,
      });
    }
  },
  verifyAndUpdatePassword: async (req, res, next) => {
    try {
      const { oldPassword, newPassword } = req.body;

      if (UtilController.isEmpty(oldPassword) || UtilController.isEmpty(newPassword)) {
        return UtilController.sendError(req, res, next, {
          message: "Old password and new password are required.",
        });
      }

      const userId = req.session?.userId;
      if (!userId) {
        return UtilController.sendError(req, res, next, {
          message: "Unauthorized access.",
        });
      }

      const user = await User.findById(userId).select("_id password").lean();

      if (!user) {
        return UtilController.sendError(req, res, next, {
          message: "User not found.",
        });
      }

      const isOldPasswordValid = UtilController.comparePassword(user?.password, oldPassword, passwordSecretKey);
      if (isOldPasswordValid !== returnCode.passwordMatched) {
        return UtilController.sendSuccess(req, res, next, {
          message: "The old password is incorrect.",
          responseCode: returnCode.passwordMismatch,
        });
      }

      var ciphertext = CryptoJS.AES.encrypt(newPassword, passwordSecretKey);
      const hashedTempPassword = ciphertext.toString();

      await User.findByIdAndUpdate(userId, { password: hashedTempPassword });
      req.session.destroy();
      UtilController.sendSuccess(req, res, next, {
        message: "Password updated successfully.",
      });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },
  updateUserProfile: async (req, res, next) => {
    try {
      const { recordId, email, mobileNo, skills, ...updateObj } = req.body;

      if (!UtilController.isEmpty(mobileNo)) {
        updateObj.mobileNo = mobileNo;
      }
      if (!UtilController.isEmpty(email)) {
        updateObj.email = email;
      }

      updateObj.updatedBy = req.session.userId;
      updateObj.operatedBy = req.session.userId;
      updateObj.updatedAt = Math.floor(Date.now() / 1000);

      const user = await User.findById(recordId);
      if (!user) {
        return UtilController.sendError(req, res, next, {
          responseCode: returnCode.recordNotFound,
          message: "User not found",
        });
      }

      // Check for duplicate email,, and mobileNo in other users
      const existingUser = await User.findOne({
        _id: { $ne: recordId },
        active: true,
        $or: [{ email: updateObj.email }, { mobileNo: updateObj.mobileNo }],
      });

      if (existingUser) {
        if (existingUser.email === updateObj.email) {
          return UtilController.sendError(req, res, next, {
            responseCode: returnCode.duplicate,
            message: "Email already exists.",
          });
        }

        if (existingUser.mobileNo === updateObj.mobileNo) {
          return UtilController.sendError(req, res, next, {
            responseCode: returnCode.duplicate,
            message: "Mobile number already exists.",
          });
        }
      }

      const updatedUser = await User.findByIdAndUpdate(recordId, updateObj, {
        new: true,
      })
        .select("-id")
        .populate([
          { path: "createdBy", select: "fname lname" },
          { path: "operatedBy", select: "fname lname" },
        ]);

      if (!UtilController.isEmpty(updatedUser.permission) && Array.isArray(updatedUser.permission)) {
        for (const permissionId of updatedUser.permission) {
          const roleId = mongoose.Types.ObjectId(permissionId);

          await Role.findByIdAndUpdate(
            roleId,
            {
              $addToSet: { owner: updatedUser._id }, // Add to 'owner' array if not already present
              updatedAt: Math.floor(Date.now() / 1000),
            },
            { new: true },
          );
        }
      }

      return UtilController.sendSuccess(req, res, next, {
        user: updatedUser,
        message: "User updated successfully",
        responseCode: returnCode.validSession,
      });
    } catch (err) {
      if (err.code === 11000) {
        let errorMessage = "Duplicate key error";
        if (err.keyPattern.email) {
          errorMessage = `Email already exists: ${err.keyValue.email}`;
        } else if (err.keyPattern.mobileNo) {
          errorMessage = `Mobile number already exists: ${err.keyValue.mobileNo}`;
        }
        return UtilController.sendError(req, res, next, {
          message: errorMessage,
          code: returnCode.duplicate,
          data: err,
        });
      }

      UtilController.sendError(req, res, next, err);
    }
  },
  changePassword: async (req, res, next) => {
    try {
      const { oldPassword, newPassword, confirmPassword } = req.body;

      if (
        UtilController.isEmpty(oldPassword) ||
        UtilController.isEmpty(newPassword) ||
        UtilController.isEmpty(confirmPassword)
      ) {
        return UtilController.sendError(req, res, next, {
          message: "Old password ,  new password and confirm password are required.",
        });
      }

      const userId = req.session?.userId;
      if (!userId) {
        return UtilController.sendError(req, res, next, {
          message: "Unauthorized access.",
        });
      }

      const user = await User.findById(userId).select("_id password").lean();

      if (!user) {
        return UtilController.sendError(req, res, next, {
          message: "User not found.",
        });
      }

      const isOldPasswordValid = UtilController.comparePassword(user?.password, oldPassword, passwordSecretKey);
      if (isOldPasswordValid !== returnCode.passwordMatched) {
        return UtilController.sendSuccess(req, res, next, {
          message: "The old password is incorrect.",
          responseCode: returnCode.passwordMismatch,
        });
      }

      const isMatchnewAndConfirmPasswordValid = UtilController.comparePassword(
        newPassword,
        confirmPassword,
        passwordSecretKey,
      );
      if (isMatchnewAndConfirmPasswordValid !== returnCode.passwordMatched) {
        return UtilController.sendSuccess(req, res, next, {
          message: "The new password and confirm password does not match.",
          responseCode: returnCode.passwordMismatch,
        });
      }

      var ciphertext = CryptoJS.AES.encrypt(newPassword, passwordSecretKey);
      const hashedTempPassword = ciphertext.toString();

      await User.findByIdAndUpdate(userId, { password: hashedTempPassword });
      req.session.destroy();
      UtilController.sendSuccess(req, res, next, {
        message: "Password updated successfully.",
      });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },
  changeNotificationSetting: async (req, res, next) => {
    try {
      const { recordId, isNotificationEnable } = req.body;

      const user = await User.findById(recordId);
      if (!user) {
        return UtilController.sendError(req, res, next, {
          responseCode: returnCode.recordNotFound,
          message: "User not found",
        });
      }

      const updatedUser = await User.findByIdAndUpdate(
        recordId,
        { isNotificationEnable: isNotificationEnable },
        {
          new: true,
        },
      );

      return UtilController.sendSuccess(req, res, next, {
        user: updatedUser,
        message: "Notification Setting updated successfully",
        responseCode: returnCode.validSession,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
};
