const mongoose = require("mongoose");
const Activity = require("../../models/Activity");
const Project = require("../../models/Project");
const ActivityComment = require("../../models/ActivityComment");
const UtilController = require("./../services/UtilController");
const NotificationController = require("../services/NotificationController");
const Notification = require("../../models/Notification");
const returnCode = require("../../../config/responseCode").returnCode;

const validateInput = (body, requiredFields) => {
  const errors = [];

  requiredFields.forEach(field => {
    if (body[field] === undefined) {
      errors.push(`${field} is required`);
    } else if (typeof body[field] === "string") {
      const trimmedValue = body[field].trim();
      if (trimmedValue === "") {
        errors.push(`${field} cannot be empty`);
      }
      body[field] = trimmedValue;
    } else if (body[field] === "") {
      errors.push(`${field} cannot be empty`);
    }
  });

  return errors;
};

module.exports = {
  createActivity: async (req, res, next) => {
    try {
      let requiredFields = ["domain", "name"];

      if (req.session.isSuperAdmin) {
        requiredFields.push("organization");
      }

      const validationErrors = validateInput(req.body, requiredFields);

      if (validationErrors.length > 0) {
        return UtilController.sendError(req, res, next, {
          message: "Validation errors occurred.",
          errors: validationErrors,
          responseCode: returnCode.incompleteBody,
        });
      }

      const { project, domain, name, description, attachment } = req.body;
      const userId = req.session.userId;
      const userType = (req.session.userType || "").toLowerCase();
      let organization;

      if (req.session.isSuperAdmin) {
        organization = req.body.organization;
      } else {
        organization = req.session.organizationId;
      }

      const sameNameActivityExists = await Activity.findOne({
        organizationId: mongoose.Types.ObjectId(organization),
        name: name,
      });

      if (sameNameActivityExists) {
        return UtilController.sendError(req, res, next, {
          responseCode: returnCode.duplicate,
          message: "Activity with same name already exists",
        });
      }

      if (project) {
        const projectExists = await Project.findById(project);
        if (!projectExists) {
          return UtilController.sendError(req, res, next, {
            responseCode: returnCode.duplicate,
            message: "Project does not exist",
          });
        }
      }

      const isAdminUser = req.session.isSuperAdmin || userType === "admin";

      const activity = new Activity({
        organizationId: mongoose.Types.ObjectId(organization),
        projectId: project ? mongoose.Types.ObjectId(project) : null,
        domain,
        attachment,
        name,
        description,
        active: isAdminUser, // Non-admin creations stay inactive until approved
        reviewStatus: isAdminUser ? "approved" : "pending",
        createdBy: mongoose.Types.ObjectId(userId),
        updatedBy: mongoose.Types.ObjectId(userId),
      });

      const result = await activity.save();
      //sending notification
      if (!UtilController.isEmpty(req.session.organizationId)) {
        await Notification.create({
          userType: "organizationAdmin",
          recordId: result?._id,
          userId: req.session.userId,
          organizationId: req.session.organizationId,
          title: `New Activity Created`,
          body: `A new activity ${result?.name} has been created. Click to view the details and get started`,
          type: "system",
          read: false,
          visibleOnHome: true,
          actionUrl: `/activity?id=${result._id}`,
        });
      }

      return UtilController.sendSuccess(req, res, next, {
        result,
        message: "Activity created successfully",
        responseCode: returnCode.validSession,
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },
  createSubactivity: async (req, res, next) => {
    try {
      let requiredFields = ["activity", "name"];

      const validationErrors = validateInput(req.body, requiredFields);

      if (validationErrors.length > 0) {
        return UtilController.sendError(req, res, next, {
          message: "Validation errors occurred.",
          errors: validationErrors,
          responseCode: returnCode.incompleteBody,
        });
      }

      const { activity, name, description, attachment, subActivityAttachment } = req.body;
      const userId = req.session.userId;

      const parentActivity = await Activity.findById(activity);

      if (!parentActivity || !parentActivity.active) {
        return UtilController.sendError(req, res, next, {
          message: "Parent activity not found",
          responseCode: returnCode.incompleteBody,
        });
      }

      const sameNameSubactivityExists = await Activity.findOne({
        parentActivity: mongoose.Types.ObjectId(activity),
        name: name,
        active: true,
      });

      if (sameNameSubactivityExists) {
        return UtilController.sendError(req, res, next, {
          message: "Subactivity with same name already exists",
          responseCode: returnCode.duplicate,
        });
      }

      const subactivity = new Activity({
        organizationId: parentActivity.organizationId,
        projectId: parentActivity.projectId,
        domain: parentActivity.domain,
        isParent: false,
        parentActivity: mongoose.Types.ObjectId(activity),
        subActivityAttachment: subActivityAttachment,
        name,
        description,
        attachment,
        createdBy: mongoose.Types.ObjectId(userId),
        updatedBy: mongoose.Types.ObjectId(userId),
      });

      const result = await subactivity.save();

      return UtilController.sendSuccess(req, res, next, {
        data: result,
        message: "Subactivity created successfully",
        responseCode: returnCode.validSession,
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },
  updateActivity: async (req, res, next) => {
    try {
      const { recordId, name, description, attachment, active } = req.body;

      if (!recordId || recordId.trim() === "" || !mongoose.Types.ObjectId.isValid(recordId)) {
        return UtilController.sendError(req, res, next, {
          message: "Invalid activity id",
          responseCode: returnCode.incompleteBody,
        });
      }

      const activity = await Activity.findById(recordId);
      if (!activity) {
        return UtilController.sendError(req, res, next, {
          message: "Activity not found",
          responseCode: returnCode.incompleteBody,
        });
      }

      const updateObj = {
        updatedAt: Math.floor(Date.now() / 1000),
        updatedBy: mongoose.Types.ObjectId(req.session.userId),
      };

      if (name) {
        updateObj["name"] = name;
      }

      const sameNameActivityExists = await Activity.findOne({
        organizationId: activity.organizationId,
        name: name,
        _id: { $ne: mongoose.Types.ObjectId(recordId) },
      });

      if (sameNameActivityExists) {
        return UtilController.sendError(req, res, next, {
          message: "Activity with same name already exists",
          responseCode: returnCode.duplicate,
        });
      }

      if (description) {
        updateObj["description"] = description;
      }
      updateObj["attachment"] = attachment;

      // Only admin/superAdmin can change activity status
      if (typeof active === "boolean") {
        const userType = (req.session.userType || "").toLowerCase();
        const isAdminUser = req.session.isSuperAdmin || userType === "admin";

        if (!isAdminUser) {
          return UtilController.sendError(req, res, next, {
            message: "You are not authorized to change activity status.",
            responseCode: returnCode.noPermission,
          });
        }

        updateObj["active"] = active;
        updateObj["reviewStatus"] = active ? "approved" : "rejected";
      }

      const result = await Activity.findByIdAndUpdate(recordId, updateObj, { new: true });

      return UtilController.sendSuccess(req, res, next, {
        data: result,
        message: "Activity updated successfully",
        responseCode: returnCode.validSession,
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error.message);
    }
  },
  updateSubactivity: async (req, res, next) => {
    try {
      const { recordId, name, description, subActivityAttachment } = req.body;
      const userId = req.session.userId;

      if (!recordId || recordId.trim() === "" || !mongoose.Types.ObjectId.isValid(recordId)) {
        return UtilController.sendError(req, res, next, {
          message: "Invalid subactivity id",
          responseCode: returnCode.incompleteBody,
        });
      }

      const subactivity = await Activity.findById(recordId);
      if (!subactivity) {
        return UtilController.sendError(req, res, next, {
          message: "Subactivity not found",
          responseCode: returnCode.incompleteBody,
        });
      }

      const updateObj = {
        updatedAt: Math.floor(Date.now() / 1000),
        updatedBy: mongoose.Types.ObjectId(userId),
      };

      if (name) {
        updateObj["name"] = name;
      }

      const sameNameSubactivityExists = await Activity.findOne({
        parentActivity: subactivity.parentActivity,
        name: name,
        _id: { $ne: mongoose.Types.ObjectId(recordId) },
      });

      if (sameNameSubactivityExists) {
        return UtilController.sendError(req, res, next, {
          message: "Subactivity with same name already exists",
          responseCode: returnCode.duplicate,
        });
      }

      if (description) {
        updateObj["description"] = description;
      }
      if (subActivityAttachment) {
        updateObj["subActivityAttachment"] = subActivityAttachment;
      }

      const result = await Activity.findByIdAndUpdate(recordId, updateObj, { new: true });

      return UtilController.sendSuccess(req, res, next, {
        data: result,
        message: "Subactivity updated successfully",
        responseCode: returnCode.validSession,
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error.message);
    }
  },
  fetchAllActivities: async (req, res, next) => {
    try {
      const {
        keyword,
        sortBy = "createdAt",
        order = "desc",
        page = 0,
        pageSize = 10,
        status,
        organizationId,
        createdBy,
        updatedBy,
        projectId,
        domain,
        startDate,
        endDate,
      } = req.body;

      const userOrganization = req.session.organizationId;

      const parsedPage = parseInt(page, 10);
      const parsedLimit = parseInt(pageSize, 10);

      if (isNaN(parsedPage) || isNaN(parsedLimit) || parsedPage < 0 || parsedLimit < 1) {
        return UtilController.sendError(req, res, next, "Invalid page or limit");
      }

      // const skip = parsedPage > 0 ? (parsedPage - 1) * parsedLimit : 0;

      const skip = parsedPage * parsedLimit;

      const initialMatch = {
        isParent: true,
      };

      // Never include soft-deleted activities in any list view
      initialMatch.reviewStatus = { $ne: "deleted" };

      if (userOrganization) {
        initialMatch.organizationId = mongoose.Types.ObjectId(userOrganization);
      }

      if (organizationId) {
        initialMatch.organizationId = mongoose.Types.ObjectId(organizationId);
      }

      if (projectId) {
        initialMatch.projectId = mongoose.Types.ObjectId(projectId);
      }

      if (createdBy) {
        initialMatch.createdBy = mongoose.Types.ObjectId(createdBy);
      }

      if (updatedBy) {
        initialMatch.updatedBy = mongoose.Types.ObjectId(updatedBy);
      }

      if (domain) {
        initialMatch.domain = domain;
      }

      if (status === "inactive") {
        initialMatch.active = false;
      } else if (status === "all") {
      } else {
        initialMatch.active = true;
      }

      const pipeline = [
        {
          $match: initialMatch,
        },
        {
          $lookup: {
            from: "organizations",
            localField: "organizationId",
            foreignField: "_id",
            as: "organization",
          },
        },
        {
          $unwind: {
            path: "$organization",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "projects",
            localField: "projectId",
            foreignField: "_id",
            as: "project",
          },
        },
        {
          $unwind: {
            path: "$project",
            preserveNullAndEmptyArrays: true,
          },
        },
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
            localField: "updatedBy",
            foreignField: "_id",
            as: "updatedBy",
          },
        },
        {
          $unwind: {
            path: "$updatedBy",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "activities",
            let: { parentId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$parentActivity", "$$parentId"] },
                  active: true,
                },
              },
            ],
            as: "subactivities",
          },
        },
      ];

      if (keyword) {
        pipeline.push({
          $match: {
            $or: [
              { name: { $regex: keyword, $options: "i" } },
              { "organization.organizationName": { $regex: keyword, $options: "i" } },
              { "project.projectName": { $regex: keyword, $options: "i" } },
              { "createdBy.fname": { $regex: keyword, $options: "i" } },
              { "createdBy.lname": { $regex: keyword, $options: "i" } },
              { "updatedBy.fname": { $regex: keyword, $options: "i" } },
              { "updatedBy.lname": { $regex: keyword, $options: "i" } },
              { domain: { $regex: keyword, $options: "i" } },
            ],
          },
        });
      }

      if (startDate && endDate) {
        pipeline.push({
          $match: {
            createdAt: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        });
      }

      pipeline.push({
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $sort: { [sortBy]: order === "desc" ? -1 : 1 } },
            { $skip: skip },
            { $limit: parsedLimit },
            {
              $project: {
                _id: 1,
                name: 1,
                active: 1,
                reviewStatus: 1,
                organizationName: "$organization.organizationName",
                organizationName: "$organization.organizationName",
                projectName: "$project.projectName",
                domain: 1,
                description: 1,
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
                updatedBy: {
                  $concat: [{ $ifNull: ["$updatedBy.fname", ""] }, " ", { $ifNull: ["$updatedBy.lname", ""] }],
                },
                updatedById: "$updatedBy._id",
                updatedByProfileImage: {
                  $let: {
                    vars: {
                      profileImage: {
                        $trim: {
                          input: { $ifNull: ["$updatedBy.profileImage", ""] },
                        },
                      },
                      profileImageUrl: {
                        $trim: {
                          input: { $ifNull: ["$updatedBy.profileImageUrl", ""] },
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
                subactivities: 1,
                createdAt: 1,
                updatedAt: 1,
              },
            },
          ],
        },
      });

      const [result] = await Activity.aggregate(pipeline);

      const { metadata, data: activities } = result;
      const { total } = metadata[0] || 0;
      const totalPages = Math.ceil(total / parsedLimit);

      return UtilController.sendSuccess(req, res, next, {
        rows: activities,
        pages: parsedPage,
        filterRecords: total,
        responseCode: returnCode.validSession,
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },
  fetchActivityById: async (req, res, next) => {
    try {
      const { recordId } = req.body;

      const pipeline = [
        {
          $match: {
            _id: mongoose.Types.ObjectId(recordId),
            reviewStatus: { $ne: "deleted" },
          },
        },
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
            from: "organizations",
            localField: "organizationId",
            foreignField: "_id",
            as: "organizationId",
          },
        },
        {
          $unwind: {
            path: "$organizationId",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "projects",
            localField: "projectId",
            foreignField: "_id",
            as: "projectId",
          },
        },
        {
          $unwind: {
            path: "$projectId",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "activities",
            let: { parentId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$parentActivity", "$$parentId"] },
                  active: true,
                },
              },
            ],
            as: "subactivities",
          },
        },
        {
          $project: {
            project: {
              name: "$projectId.projectName",
              _id: "$projectId._id",
            },
            organization: {
              name: "$organizationId.organizationName",
              _id: "$organizationId._id",
            },
            domain: 1,
            name: 1,
            attachment: 1,
            description: 1,
            comments: 1,
            subActivityAttachment: 1,
            createdAt: 1,
            updatedAt: 1,
            createdBy: {
              fname: "$createdBy.fname",
              lname: "$createdBy.lname",
              _id: "$createdBy._id",
            },
            subactivities: {
              $map: {
                input: "$subactivities",
                as: "subactivity",
                in: {
                  _id: "$$subactivity._id",
                  name: "$$subactivity.name",
                  description: "$$subactivity.description",
                  subActivityAttachment: "$$subactivity.subActivityAttachment",
                  comments: "$$subactivity.comments",
                  createdAt: "$$subactivity.createdAt",
                  updatedAt: "$$subactivity.updatedAt",
                },
              },
            },
          },
        },
      ];

      const [activity] = await Activity.aggregate(pipeline);
      const comments = await ActivityComment.find({ activity: mongoose.Types.ObjectId(recordId) }).sort({
        createdAt: -1,
      });

      return UtilController.sendSuccess(req, res, next, {
        activity,
        comments,
        message: "Activity fetched successfully",
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },

  // API to get all users for dropdown selection with search keyword
  queryCreatedByDropdown: async (req, res, next) => {
    try {
      // Extract search keyword from request query
      const { keyword } = req.query;
      const { organizationId } = req.session;

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
        // Add match stage for organizationId
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
      let result = await Activity.aggregate(pipeline);

      // Send success response
      UtilController.sendSuccess(req, res, next, {
        result,
      });
    } catch (err) {
      console.error(err);
      UtilController.sendError(req, res, next, err);
    }
  },

  activityDropdown: async (req, res, next) => {
    try {
      const { activity, keyword, page, pageSize, searchSubactivity = false, domain } = req.body;
      const organizationId = req.session.organizationId;

      const parsedPage = parseInt(page, 10);
      const parsedLimit = parseInt(pageSize, 10);

      if (isNaN(parsedPage) || isNaN(parsedLimit) || parsedPage < 0 || parsedLimit < 1) {
        return UtilController.sendError(req, res, next, "Invalid page or limit");
      }
      const skip = parsedPage > 0 ? (parsedPage - 1) * parsedLimit : 0;

      const matchStage = {
        active: true,
        reviewStatus: { $ne: "deleted" },
      };

      if (organizationId) {
        matchStage.organizationId = mongoose.Types.ObjectId(organizationId);
      }

      if (searchSubactivity) {
        if (activity) {
          matchStage.parentActivity = mongoose.Types.ObjectId(activity);
        }
        matchStage.isParent = false;
      } else {
        matchStage.isParent = true;
      }

      if (domain && domain.trim() !== "") {
        matchStage.domain = domain;
      }

      if (keyword && keyword.trim() !== "") {
        matchStage.name = { $regex: keyword, $options: "i" };
      }

      const [activities] = await Activity.aggregate([
        {
          $match: matchStage,
        },
        ...(searchSubactivity
          ? [
              {
                $lookup: {
                  from: "activities",
                  localField: "parentActivity",
                  foreignField: "_id",
                  as: "parentActivityDetails",
                },
              },
              {
                $unwind: {
                  path: "$parentActivityDetails",
                  preserveNullAndEmptyArrays: true,
                },
              },
            ]
          : []),
        {
          $facet: {
            metadata: [{ $count: "total" }],
            data: [
              { $sort: { name: 1 } },
              { $skip: skip },
              { $limit: parsedLimit },
              {
                $project: {
                  _id: 1,
                  name: 1,
                  ...(searchSubactivity
                    ? {
                        parentActivityName: "$parentActivityDetails.name",
                        parentActivityId: "$parentActivityDetails._id",
                      }
                    : {}),
                },
              },
            ],
          },
        },
      ]);

      return UtilController.sendSuccess(req, res, next, {
        rows: activities.data,
        pages: parsedPage,
        filterRecords: activities.metadata[0]?.total || 0,
        responseCode: returnCode.validSession,
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },

  deleteActivity: async (req, res, next) => {
    try {
      const { recordIds } = req.body; // Expecting an array of record IDs
      const userId = req.session.userId;

      if (!Array.isArray(recordIds) || recordIds.length === 0) {
        return UtilController.sendError(req, res, next, {
          message: "No valid activity IDs provided",
        });
      }

      await Activity.updateMany(
        { _id: { $in: recordIds } },
        {
          active: false,
          reviewStatus: "deleted",
          updatedAt: Math.floor(Date.now() / 1000),
          updatedBy: mongoose.Types.ObjectId(userId),
        },
      );

      return UtilController.sendSuccess(req, res, next, {
        message: "Activities deleted successfully.",
      });
    } catch (error) {
      console.error(error);
      return UtilController.sendError(req, res, next, error.message);
    }
  },
  //comments api
  addComment: async (req, res, next) => {
    try {
      const { recordId, content, mentions, attchments } = req.body;
      const userId = req.session.userId;

      const requiredFields = ["recordId", "content"];
      const validationErrors = validateInput(req.body, requiredFields);
      if (validationErrors.length > 0) {
        return UtilController.sendError(req, res, next, {
          message: "Validation errors occurred.",
          errors: validationErrors,
        });
      }

      const comment = new ActivityComment({
        activity: mongoose.Types.ObjectId(recordId),
        content,
        createdBy: mongoose.Types.ObjectId(userId),
        mentions: mentions.map(mention => {
          return {
            user: mongoose.Types.ObjectId(mention.userId),
            name: mention.username,
          };
        }),
        attchments: attchments.map(attachment => {
          return {
            name: attachment.name,
            url: attachment.url,
          };
        }),
      });

      await comment.save();

      return UtilController.sendSuccess(req, res, next, {
        message: "Comment added successfully",
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },
  deleteComment: async (req, res, next) => {
    try {
      const { recordId } = req.body;

      const comment = await ActivityComment.findById(recordId);
      if (!comment) {
        return UtilController.sendError(req, res, next, "Comment not found");
      }
      await comment.remove();

      return UtilController.sendSuccess(req, res, next, {
        message: "Comment deleted successfully",
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },
  updateComment: async (req, res, next) => {
    try {
      const { recordId, content, mentions, attchments } = req.body;
      const userId = req.session.userId;

      const requiredFields = ["recordId", "content"];
      const validationErrors = validateInput(req.body, requiredFields);
      if (validationErrors.length > 0) {
        return UtilController.sendError(req, res, next, {
          message: "Validation errors occurred.",
          errors: validationErrors,
        });
      }

      const comment = await ActivityComment.findById(recordId);
      if (!comment) {
        return UtilController.sendError(req, res, next, "Comment not found");
      }

      comment.content = content;
      comment.mentions = mentions.map(mention => {
        return {
          user: mongoose.Types.ObjectId(mention.userId),
          name: mention.username,
        };
      });
      comment.attchments = attchments.map(attachment => {
        return {
          name: attachment.name,
          url: attachment.url,
        };
      });
      comment.isUpdated = true;
      comment.updatedAt = Math.floor(Date.now() / 1000);
      await comment.save();

      return UtilController.sendSuccess(req, res, next, {
        message: "Comment updated successfully",
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },
  fetchSubActivities: async (req, res, next) => {
    try {
      const recordId = req.body.recordId;
      const subActivities = await Activity.find({
        parentActivity: mongoose.Types.ObjectId(recordId),
        active: true,
        isParent: false,
      }).select("attachment organizationId projectId domain name description");
      return UtilController.sendSuccess(req, res, next, {
        subActivities,
        message: "Subactivities fetched successfully",
      });
    } catch (err) {
      return UtilController.sendError(req, res, next, err);
    }
  },
};
