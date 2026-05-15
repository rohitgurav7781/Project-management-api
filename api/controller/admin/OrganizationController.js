const Organization = require("../../models/Organizations");
const UtilController = require("../services/UtilController");
const Tag = require("../../models/Tag");
const mongoose = require("mongoose");
const Project = require("../../models/Project");
const WorkAllocation = require("../../models/WorkAllocations");
const Option = require("../../models/Option");
const Department = require("../../models/Department");
const Timesheets = require("../../models/Timesheet");
const Roles = require("../../models/Role");
const User = require("../../models/User");
const Activity = require("../../models/Activity");
const Customer = require("../../models/Customer");
const Setting = require("../../models/Setting");
const returnCode = require("../../../config/responseCode").returnCode;

module.exports = {
  createOrganization: async (req, res, next) => {
    try {
      let createObj = req.body;
      createObj["operatedBy"] = req.session.userId;
      createObj["createdBy"] = req.session.userId;

      let existingUser = await Organization.findOne({
        organizationEmail: createObj.organizationEmail,
        active: true,
      });

      if (existingUser) {
        if (existingUser.organizationEmail === createObj.organizationEmail) {
          return UtilController.sendSuccess(req, res, next, {
            responseCode: returnCode.duplicate,
            message: "Organization Email already exists.",
          });
        }
      }

      let existingemployeePrefixUser = await Organization.findOne({
        employeePrefix: createObj.employeePrefix,
        active: true,
      });

      if (existingemployeePrefixUser) {
        if (existingemployeePrefixUser.employeePrefix === createObj.employeePrefix) {
          return UtilController.sendSuccess(req, res, next, {
            responseCode: returnCode.duplicate,
            message: "Employee Prefix already exists.",
          });
        }
      }

      let tagResult = await Tag.findOneAndUpdate(
        {
          active: true,
          tagType: "organization",
        },
        {
          $inc: { sequenceNo: 1 },
          updatedAt: Math.floor(Date.now() / 1000),
        },
      );
      createObj["organizationTagId"] = tagResult.prefix + UtilController.pad(tagResult.sequenceNo, 4);

      const organization = await Organization.create(createObj);
      UtilController.sendSuccess(req, res, next, { organization });
    } catch (error) {
      if (error?.code === 11000) {
        const duplicateKey = Object.keys(error?.keyValue)[0];
        const duplicateValue = error?.keyValue[duplicateKey];
        return UtilController.sendError(req, res, next, {
          message: `${duplicateKey} "${duplicateValue}" is already present.`,
          responseCode: returnCode.duplicate,
        });
      }
      UtilController.sendError(req, res, next, error);
    }
  },

  updateOrganization: async (req, res, next) => {
    try {
      const updateObj = req.body;

      updateObj["operatedBy"] = req.session.userId;
      updateObj["updatedAt"] = Math.floor(Date.now() / 1000);

      if (updateObj.email) {
        const existingOrg = await Organization.findOne({
          email: updateObj.email,
          _id: { $ne: updateObj.recordId }, // exclude current record
        });

        if (existingOrg) {
          return UtilController.sendSuccess(req, res, next, {
            responseCode: returnCode.duplicate,
            message: "Email already exists for another organization.",
          });
        }
      }

      if (updateObj.employeePrefix) {
        const existingPrefix = await Organization.findOne({
          employeePrefix: updateObj.employeePrefix,
          _id: { $ne: updateObj.recordId }, // exclude current record
        });

        if (existingPrefix) {
          return UtilController.sendSuccess(req, res, next, {
            responseCode: returnCode.duplicate,
            message: "Employee prefix already exists for another organization.",
          });
        }
      }

      const organization = await Organization.findByIdAndUpdate(updateObj.recordId, updateObj, { new: true });

      UtilController.sendSuccess(req, res, next, { organization });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },

  deleteOrganization: async (req, res, next) => {
    try {
      let organizationId = req.body.organizationId;

      await User.updateMany(
        { organizationId: { $in: organizationId } },
        { $set: { active: false, operatedBy: req.session.userId, updatedAt: Math.floor(Date.now() / 1000) } },
      );

      await Project.updateMany(
        { organizationId: { $in: organizationId } },
        { $set: { active: false, operatedBy: req.session.userId, updatedAt: Math.floor(Date.now() / 1000) } },
      );

      await Activity.updateMany(
        { organizationId: { $in: organizationId } },
        { $set: { active: false, operatedBy: req.session.userId, updatedAt: Math.floor(Date.now() / 1000) } },
      );

      await WorkAllocation.updateMany(
        { organizationId: { $in: organizationId } },
        { $set: { active: false, operatedBy: req.session.userId, updatedAt: Math.floor(Date.now() / 1000) } },
      );

      await Customer.updateMany(
        { organizationId: { $in: organizationId } },
        { $set: { active: false, operatedBy: req.session.userId, updatedAt: Math.floor(Date.now() / 1000) } },
      );

      await Timesheets.updateMany(
        { organizationId: { $in: organizationId } },
        { $set: { active: false, operatedBy: req.session.userId, updatedAt: Math.floor(Date.now() / 1000) } },
      );

      await Department.updateMany(
        { organizationId: { $in: organizationId } },
        { $set: { active: false, operatedBy: req.session.userId, updatedAt: Math.floor(Date.now() / 1000) } },
      );

      await Option.updateMany(
        { organizationId: { $in: organizationId } },
        { $set: { active: false, operatedBy: req.session.userId, updatedAt: Math.floor(Date.now() / 1000) } },
      );

      await Roles.updateMany(
        { organizationId: { $in: organizationId } },
        { $set: { active: false, operatedBy: req.session.userId, updatedAt: Math.floor(Date.now() / 1000) } },
      );

      await Organization.updateMany(
        { _id: { $in: organizationId } },
        {
          $set: {
            active: false,
            operatedBy: req.session.userId,
            updatedAt: Math.floor(Date.now() / 1000),
          },
        },
        { new: true },
      );

      UtilController.sendSuccess(req, res, next, {
        message: "Organization and associated records deleted successfully",
      });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },

  listOrganization: async (req, res, next) => {
    try {
      //apply sort, search, pagination
      let search = {};
      if (!UtilController.isEmpty(req.body.keyword)) {
        search["$or"] = [
          // { "scuId.title": { $regex: req.body.keyword, $options: "i" } },
          { organizationName: { $regex: req.body.keyword, $options: "i" } },
          { registrationNumber: { $regex: req.body.keyword, $options: "i" } },
          { city: { $regex: req.body.keyword, $options: "i" } },
          { branchName: { $regex: req.body.keyword, $options: "i" } },
        ];
      }
      let match = {
        active: true,
      };

      // Filter by `createdBy`
      if (!UtilController.isEmpty(req.body.createdBy)) {
        match["createdBy"] = mongoose.Types.ObjectId(req.body.createdBy);
      }

      if (!UtilController.isEmpty(req.body.active)) match["active"] = req.body.active;
      if (!UtilController.isEmpty(req.body.organizationId))
        match["_id"] = mongoose.Types.ObjectId(req.body.organizationId);
      // Add $and condition if both startDate and endDate are provided
      if (!UtilController.isEmpty(req.body.startDate) || !UtilController.isEmpty(req.body.endDate)) {
        match["$and"] = [];
        if (!UtilController.isEmpty(req.body.startDate)) {
          match["$and"].push({ createdAt: { $gte: req.body.startDate } });
        }
        if (!UtilController.isEmpty(req.body.endDate)) {
          match["$and"].push({ createdAt: { $lte: req.body.endDate } });
        }
      }
      let sort = {};
      if (!UtilController.isEmpty(req.body.sortField) && !UtilController.isEmpty(req.body.sortOrder)) {
        let sortField = req.body.sortField;
        let sortOrder = req.body.sortOrder;

        sort[sortField] = sortOrder;
      } else {
        sort = { updatedAt: -1 };
      }

      let pageSize = 10;
      let page = 0;
      if (!UtilController.isEmpty(req.body.pageSize)) pageSize = req.body.pageSize;
      if (!UtilController.isEmpty(req.body.page)) page = req.body.page;

      const organization = await Organization.aggregate([
        { $match: match },
        {
          $lookup: {
            from: "users",
            localField: "createdBy",
            foreignField: "_id",
            as: "createdBy",
          },
        },
        {
          $unwind: {
            path: "$createdBy",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "operatedBy",
            foreignField: "_id",
            as: "operatedBy",
          },
        },
        {
          $unwind: {
            path: "$operatedBy",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            organizationName: 1,
            registrationNumber: 1,
            city: 1,
            state: 1,
            country: 1,
            postalCode: 1,
            organizationEmail: 1,
            organizationPhone: 1,
            branchName: 1,
            organizationAddress: 1,
            employeePrefix: 1,
            active: 1,
            createdAt: 1,
            updatedAt: 1,
            createdBy: {
              $concat: [{ $ifNull: ["$createdBy.fname", ""] }, " ", { $ifNull: ["$createdBy.lname", ""] }],
            },
            createdById: "$createdBy._id",
            createdByProfileImage: {
              $let: {
                vars: {
                  profileImage: {
                    $trim: {
                      input: { $ifNull: ["$createdBy.profileImage", ""] },
                    },
                  },
                  profileImageUrl: {
                    $trim: {
                      input: { $ifNull: ["$createdBy.profileImageUrl", ""] },
                    },
                  },
                },
                in: {
                  $cond: [
                    { $ne: ["$$profileImage", ""] },
                    "$$profileImage",
                    {
                      $cond: [{ $ne: ["$$profileImageUrl", ""] }, "$$profileImageUrl", ""],
                    },
                  ],
                },
              },
            },
            operatedBy: {
              $concat: [{ $ifNull: ["$operatedBy.fname", ""] }, " ", { $ifNull: ["$operatedBy.lname", ""] }],
            },
            operatedById: "$operatedBy._id",
            operatedByProfileImage: {
              $let: {
                vars: {
                  profileImage: {
                    $trim: {
                      input: { $ifNull: ["$operatedBy.profileImage", ""] },
                    },
                  },
                  profileImageUrl: {
                    $trim: {
                      input: { $ifNull: ["$operatedBy.profileImageUrl", ""] },
                    },
                  },
                },
                in: {
                  $cond: [
                    { $ne: ["$$profileImage", ""] },
                    "$$profileImage",
                    {
                      $cond: [{ $ne: ["$$profileImageUrl", ""] }, "$$profileImageUrl", ""],
                    },
                  ],
                },
              },
            },
            // createdBy: {
            //   $concat: ["$createdBy.fname", " ", "$createdBy.lname"]
            // },
            // operatedBy: {
            //   $concat: ["$operatedBy.fname", " ", "$operatedBy.lname"]
            // },
          },
        },
        { $match: search },
        {
          $facet: {
            totalCount: [{ $count: "count" }],
            data: [{ $sort: sort }, { $skip: page * pageSize }, { $limit: pageSize }],
          },
        },
      ]);
      const totalCount = organization[0].totalCount[0] ? organization[0].totalCount[0].count : 0;
      const rows = organization[0].data;
      const pages = Math.ceil(totalCount / pageSize);

      UtilController.sendSuccess(req, res, next, {
        rows: rows,
        filterRecords: totalCount,
        pages: pages,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
  organizationById: async (req, res, next) => {
    try {
      const organization = await Organization.findById(req.body.organizationId)
        .populate("createdBy", "fname lname")
        .populate("operatedBy", "fname lname");
      UtilController.sendSuccess(req, res, next, { organization });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },

  dropdownOrganization: async (req, res, next) => {
    try {
      let search = {};
      if (!UtilController.isEmpty(req.body.keyword)) {
        search["$or"] = [
          { organizationName: { $regex: req.body.keyword, $options: "i" } },
          { registrationNumber: { $regex: req.body.keyword, $options: "i" } },
        ];
      }

      let match = { active: true };
      let sort = { updatedAt: -1 };

      const organization = await Organization.aggregate([
        { $match: match },
        {
          $project: {
            organizationName: 1,
            organizationTagId: 1,
          },
        },
        { $match: search },
        { $sort: sort },
      ]);

      UtilController.sendSuccess(req, res, next, {
        rows: organization,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },

  // API to get all users for dropdown selection with search keyword
  queryCreatedByUsers: async (req, res, next) => {
    try {
      // Extract search keyword from request query
      const { keyword } = req.query;

      // Aggregate pipeline to get distinct createdBy users
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
          $group: {
            _id: "$createdByUser._id",
            fname: { $first: "$createdByUser.fname" },
            lname: { $first: "$createdByUser.lname" },
          },
        },
        // Add a match stage for filtering based on keyword
        ...(keyword
          ? [
              {
                $match: {
                  $or: [
                    { fname: { $regex: keyword, $options: "i" } }, // Match first name
                    { lname: { $regex: keyword, $options: "i" } }, // Match last name
                  ],
                },
              },
            ]
          : []), // Skip match if no keyword is provided
        {
          $sort: { fname: 1 }, // Sort by first name
        },
        {
          $project: {
            _id: 1, // User ID
            fname: 1, // First Name
            lname: 1, // Last Name
          },
        },
      ];

      // Fetch results
      let result = await Organization.aggregate(pipeline);

      // Send success response
      UtilController.sendSuccess(req, res, next, {
        result,
      });
    } catch (err) {
      console.error(err);
      UtilController.sendError(req, res, next, err);
    }
  },
};
