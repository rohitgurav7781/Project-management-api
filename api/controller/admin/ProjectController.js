const Project = require("../../models/Project");
const UtilController = require("../services/UtilController");
const Tag = require("../../models/Tag");
const mongoose = require("mongoose");
const WorkAllocation = require("../../models/WorkAllocations");
const User = require("../../models/User");
const NotificationController = require("../services/NotificationController");
const Notification = require("../../models/Notification");
const WorkAllocations = require("../../models/WorkAllocations");
const ProjectHoursExtension = require("../../models/ProjectHoursExtension");
const returnCode = require("../../../config/responseCode").returnCode;

function parseCustomerContacts(names = "", numbers = "") {
  const nameList = names
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  const numberList = numbers
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  const length = Math.max(nameList.length, numberList.length);

  return Array.from({ length }, (_, i) => ({
    personName: nameList[i] || "",
    phoneNo: numberList[i] || "",
  }));
}

module.exports = {
  createProjectHoursExtensionRequest: async (req, res) => {
    try {
      const { projectId, requestedEstimatedHours, requestedProjectHours, reason } = req.body;
      if (UtilController.isEmpty(req.session.organizationId)) throw { message: "Organization Id is required" };

      const newProjectHoursExtension = new ProjectHoursExtension({
        organizationId: req.session.organizationId,
        userId: req.session.userId,
        projectId,
        requestedEstimatedHours,
        requestedProjectHours,
        reason,
      });

      const savedProjectHoursExtension = await newProjectHoursExtension.save();
      res
        .status(201)
        .json({ message: "Project Hours Extension request created successfully", data: savedProjectHoursExtension });
    } catch (error) {
      res.status(500).json({ message: "Error creating Project Hours Extension request", error: error.message });
    }
  },
  getProjectHoursExtensionRequestDetails: async (req, res, next) => {
    try {
      const detail = await ProjectHoursExtension.find({ projectId: req.body.projectId });
      UtilController.sendSuccess(req, res, next, { detail });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },
  changeProjectHoursExtensionStatus: async (req, res, next) => {
    try {
      const { recordId, status } = req.body || {};
      if (UtilController.isEmpty(recordId)) throw { message: "Record Id is required" };
      const rawStatus = String(status || "").toLowerCase();
      const nextStatus = rawStatus === "reject" ? "rejected" : rawStatus === "approve" ? "approved" : rawStatus;
      if (!["approved", "rejected", "open", "pending"].includes(nextStatus)) {
        throw { message: "Invalid status" };
      }

      const extension = await ProjectHoursExtension.findById(recordId);
      if (!extension) throw { message: "Extension request not found" };

      extension.status = nextStatus;
      extension.operatedBy = req.session.userId;
      extension.updatedAt = Math.floor(Date.now() / 1000);
      await extension.save();

      // If approved, update the project's hours from requested values
      if (nextStatus === "approved" && extension.projectId) {
        await Project.findByIdAndUpdate(
          extension.projectId,
          {
            $set: {
              projectHours: Number(extension.requestedProjectHours) || 0,
              estimatedHours: Number(extension.requestedEstimatedHours) || 0,
              operatedBy: req.session.userId,
              updatedAt: Math.floor(Date.now() / 1000),
            },
          },
          { new: true },
        );
      }

      UtilController.sendSuccess(req, res, next, { extension });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },
  createProject: async (req, res, next) => {
    try {
      let createObj = req.body;
      if (createObj.teamIds) {
        createObj.team = createObj.teamIds;
        delete createObj.teamIds;
      }
      if (createObj.customerId) {
        createObj.customerId = mongoose.Types.ObjectId(createObj.customerId);
      }
      // delete createObj.customerName;

      createObj["operatedBy"] = req.session.userId;
      createObj["createdBy"] = req.session.userId;
      let tagResult = await Tag.findOneAndUpdate(
        {
          active: true,
          tagType: "project",
        },
        {
          $inc: { sequenceNo: 1 },
          updatedAt: Math.floor(Date.now() / 1000),
        },
      );
      createObj["projectTagId"] = tagResult.prefix + UtilController.pad(tagResult.sequenceNo, 4);
      createObj["organizationId"] = req.session.organizationId;
      if (UtilController.isEmpty(createObj["organizationId"])) throw { message: "Organization Id is required" };

      createObj.projectNumber = String(createObj.projectNumber || "").trim();
      if (UtilController.isEmpty(createObj.projectNumber)) throw { message: "Project Number is required" };

      const existingProject = await Project.findOne({
        projectNumber: createObj.projectNumber,
        organizationId: createObj["organizationId"],
        active: true,
      });
      if (existingProject) {
        return UtilController.sendSuccess(req, res, next, {
          responseCode: returnCode.duplicate,
          message: "Project Number already exists try different number",
        });
      }

      if (UtilController.isEmpty(createObj.projectStatus)) {
        createObj["projectStatus"] = "Open";
      } else {
        createObj["projectStatus"] = String(createObj.projectStatus).trim();
      }

      createObj.customerContacts = parseCustomerContacts(
        createObj.customerContactPersonNames,
        createObj.customerContactPersonNumbers,
      );
      delete createObj.customerContactPersonNames;
      delete createObj.customerContactPersonNumbers;

      const project = await Project.create(createObj);
      const projectWithCustomer = await Project.findById(project._id).populate("customerId", "companyName _id");

      //send notification for the project created
      let projectDetails = await Project.findById(project?._id).populate("customerId");
      await Notification.create({
        userId: project._id,
        senderId: project._id,
        title: `New Project Created`,
        body: `A new project has been added to the organization ${project.projectName}. Click to view the project details`,
        type: "system",
        read: false,
        visibleOnHome: true,
        actionUrl: `/projects?id=${project._id}`,
        recordId: project._id,
        userType: "superAdmin",
      });
      // for manager/team users (include TLS from project team)
      const createRecipients = Array.from(
        new Set([
          ...(Array.isArray(project?.projectHead) ? project.projectHead : []),
          ...(Array.isArray(project?.team) ? project.team : []),
          ...(Array.isArray(createObj?.projectHead) ? createObj.projectHead : []),
          ...(Array.isArray(createObj?.team) ? createObj.team : []),
          ...(Array.isArray(createObj?.teamIds) ? createObj.teamIds : []),
        ].map((id) => String(id || "").trim()).filter(Boolean)),
      );
      if (createRecipients.length > 0) {
        await Promise.all(
          createRecipients.map(async (userId) => {
            await Notification.create({
              userType: "manager",
              recordId: project?._id,
              userId,
              title: `New Project Assigned: ${projectDetails?.projectName}`,
              body: `Tasks have been successfully allocated to employees. Click to review the task`,
              type: "system",
              read: false,
              visibleOnHome: true,
              actionUrl: `/projects?id=${project._id}`,
            });
          }),
        );
      }

      await Notification.create({
        userType: "organizationAdmin",
        recordId: project?._id,
        userId: req.session.userId,
        organizationId: projectDetails?.organizationId,
        title: `New Project created`,
        body: `A new project has been created. Click to view the project details`,
        type: "system",
        read: false,
        visibleOnHome: true,
        actionUrl: `/projects?id=${project._id}`,
      });
      UtilController.sendSuccess(req, res, next, { project: projectWithCustomer });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },
  updateProject: async (req, res, next) => {
    try {
      if (UtilController.isEmpty(req.body.projectId)) throw { message: "Project Id is required" };
      const updateObj = req.body;
      if (updateObj.teamIds) {
        updateObj.team = updateObj.teamIds;
        delete updateObj.teamIds;
      }

      if (updateObj.customerId) {
        updateObj.customerId = mongoose.Types.ObjectId(updateObj.customerId);
      }
      // Remove customerName as it's not in schema
      // delete updateObj.customerName;

      updateObj["operatedBy"] = req.session.userId;
      updateObj["updatedAt"] = Math.floor(Date.now() / 1000);

      // Prevent duplicate projectNumber for the same organization.
      if (!UtilController.isEmpty(updateObj.projectNumber)) {
        updateObj.projectNumber = String(updateObj.projectNumber || "").trim();
        const existingProject = await Project.findOne({
          projectNumber: updateObj.projectNumber,
          organizationId: req.session.organizationId,
          active: true,
          _id: { $ne: updateObj.projectId },
        });
        if (existingProject) {
          return UtilController.sendSuccess(req, res, next, {
            responseCode: returnCode.duplicate,
            message: "Project Number already exists try different number",
          });
        }
      }

      // Keep custom statuses from Settings; ignore only blank values.
      if (!UtilController.isEmpty(updateObj.projectStatus)) {
        updateObj.projectStatus = String(updateObj.projectStatus).trim();
      } else if (Object.prototype.hasOwnProperty.call(updateObj, "projectStatus")) {
        delete updateObj.projectStatus;
      }

      updateObj.customerContacts = parseCustomerContacts(
        updateObj.customerContactPersonNames,
        updateObj.customerContactPersonNumbers,
      );
      delete updateObj.customerContactPersonNames;
      delete updateObj.customerContactPersonNumbers;

      const project = await Project.findByIdAndUpdate(updateObj.projectId, updateObj, { new: true }).populate(
        "customerId",
        "companyName _id",
      );
      await Notification.create({
        userId: req.session.organizationId,
        senderId: req.session.userId,
        organizationId: project?.organizationId,
        title: `Project Update: ${project?.projectName}`,
        body: `The project ${project?.projectName} has been updated. Click to review the changes`,
        type: "system",
        read: false,
        visibleOnHome: true,
        actionUrl: `/projects?id=${project._id}`,
        recordId: project._id,
        userType: "organizationAdmin",
      });
      //for manager
      await Promise.all(
        project?.projectHead.map(async userId => {
          await Notification.create({
            userId: userId,
            senderId: req.session.userId,
            organizationId: req.session.organizationId,
            title: `Project Update: ${project?.projectName}`,
            body: `The project ${project?.projectName} has been updated. Click to review the changes`,
            type: "system",
            read: false,
            visibleOnHome: true,
            actionUrl: `/projects?id=${project._id}`,
            recordId: project._id,
            userType: "manager",
          });
        }),
      );

      UtilController.sendSuccess(req, res, next, { project });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },
  deleteProject: async (req, res, next) => {
    try {
      let projectId = req.body.projectId;
      const workallocations = await WorkAllocation.findOne({ projectId: { $in: projectId } });
      if (workallocations) {
        return UtilController.sendSuccess(req, res, next, {
          responseCode: returnCode.noPermission,
          message: "Project cannot be deleted as it is associated with a work allocation",
        });
      }
      await Project.updateMany(
        { _id: { $in: projectId } },
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
        message: "Project deleted successfully",
      });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },
  listProject: async (req, res, next) => {
    try {
      const STATUS_STEPS = ["open", "allocated", "completed", "on_hold", "reopened", "archived"];

      let search = {};
      let userId = req.session.userId;
      let userType = req.session.userType;

      if (!UtilController.isEmpty(req.body.keyword)) {
        search["$or"] = [
          { projectName: { $regex: req.body.keyword, $options: "i" } },
          { projectDescription: { $regex: req.body.keyword, $options: "i" } },
          { projectTagId: { $regex: req.body.keyword, $options: "i" } },
        ];
      }

      let match = { active: true };

      if (!UtilController.isEmpty(req.session.organizationId))
        match["organizationId"] = mongoose.Types.ObjectId(req.session.organizationId);
      if (!UtilController.isEmpty(req.body.active)) match["active"] = req.body.active;
      if (!UtilController.isEmpty(req.body.ProjectId)) match["_id"] = mongoose.Types.ObjectId(req.body.ProjectId);
      if (!UtilController.isEmpty(req.body.createdBy)) match["createdBy"] = mongoose.Types.ObjectId(req.body.createdBy);
      if (!UtilController.isEmpty(req.body.organizationId))
        match["organizationId"] = mongoose.Types.ObjectId(req.body.organizationId);
      if (!UtilController.isEmpty(req.body.customerId))
        match["customerId"] = mongoose.Types.ObjectId(req.body.customerId);
      if (!UtilController.isEmpty(req.body.customerName))
        match["customerName"] = mongoose.Types.ObjectId(req.body.customerName);

      if (!UtilController.isEmpty(req.body.startDate) || !UtilController.isEmpty(req.body.endDate)) {
        match["$and"] = [];
        if (!UtilController.isEmpty(req.body.startDate))
          match["$and"].push({ createdAt: { $gte: req.body.startDate } });
        if (!UtilController.isEmpty(req.body.endDate)) match["$and"].push({ createdAt: { $lte: req.body.endDate } });
      }

      if (!UtilController.isEmpty(req.body.projectStatus)) match["projectStatus"] = { $eq: req.body.projectStatus };
      if (!UtilController.isEmpty(req.body.projectHead))
        match["projectHead"] = mongoose.Types.ObjectId(req.body.projectHead);

      if (!UtilController.isEmpty(userId)) {
        const role = userType?.toLowerCase();

        if (role === "manager" || role === "tls") {
          match["$or"] = [
            { projectHead: mongoose.Types.ObjectId(userId) },
            { createdBy: mongoose.Types.ObjectId(userId) },
            { team: mongoose.Types.ObjectId(userId) },
          ];
        }

        if (role === "employee") {
          const projectIdsFromAllocations = await WorkAllocation.distinct("projectId", {
            employeeId: mongoose.Types.ObjectId(userId),
            active: true,
          });

          match["$or"] = [{ _id: { $in: projectIdsFromAllocations } }, { createdBy: mongoose.Types.ObjectId(userId) }];
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

      const progressProjectStage = {
        $project: {
          _id: 1,
          projectTagId: 1,
          customerId: "$customerId._id",
          customerName: 1,
          projectName: 1,
          projectNumber: 1,
          projectDescription: 1,
          startDate: 1,
          endDate: 1,
          projectStatus: 1,
          customerContacts: 1,
          estimatedHours: 1,
          projectHours: 1,
          hasOpenProjectHoursExtension: 1,
          projectHoursExtensionStatus: 1,
          projectHead: "$projectHead",
          team: "$team",
          note: 1,
          createdAt: 1,
          updatedAt: 1,
          taskName: 1,
          companyName: "$customerId.companyName",
          country: "$customerId.country",
          progress: 1,
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
          organization: { organizationName: 1, _id: 1 },
          organizationName: "$organization.organizationName",
          customerName: "$customerId.customerName",
          // progress: {
          //   $multiply: [
          //     {
          //       $divide: [
          //         {
          //           $add: [{ $indexOfArray: [STATUS_STEPS, "$projectStatus"] }, 1],
          //         },
          //         STATUS_STEPS.length,
          //       ],
          //     },
          //     100,
          //   ],
          // },
        },
      };

      const project = await Project.aggregate([
        { $match: match },
        {
          $lookup: {
            from: "customers",
            localField: "customerId",
            foreignField: "_id",
            as: "customerId",
          },
        },
        { $unwind: { path: "$customerId", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "organizations",
            localField: "organizationId",
            foreignField: "_id",
            as: "organization",
          },
        },
        { $unwind: { path: "$organization", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "users",
            localField: "projectHead",
            foreignField: "_id",
            as: "projectHead",
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "team",
            foreignField: "_id",
            as: "team",
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
          $lookup: {
            from: "workallocations",
            let: { projectId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [{ $eq: ["$projectId", "$$projectId"] }, { $eq: ["$active", true] }],
                  },
                },
              },
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  completed: {
                    $sum: {
                      $cond: [{ $eq: ["$status", "completed"] }, 1, 0],
                    },
                  },
                },
              },
            ],
            as: "allocationStats",
          },
        },
        {
          $addFields: {
            allocationStats: {
              $ifNull: [{ $arrayElemAt: ["$allocationStats", 0] }, { total: 0, completed: 0 }],
            },
          },
        },

        // Project hours extension (open requests)
        {
          $lookup: {
            from: "projectHoursExtension",
            let: { projectId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [{ $eq: ["$projectId", "$$projectId"] }, { $eq: ["$status", "open"] }],
                  },
                },
              },
              { $sort: { updatedAt: -1 } },
              { $limit: 1 },
              { $project: { _id: 1, status: 1, updatedAt: 1 } },
            ],
            as: "projectHoursExtensionLatestOpen",
          },
        },
        {
          $addFields: {
            hasOpenProjectHoursExtension: {
              $gt: [{ $size: "$projectHoursExtensionLatestOpen" }, 0],
            },
            projectHoursExtensionStatus: {
              $ifNull: [{ $arrayElemAt: ["$projectHoursExtensionLatestOpen.status", 0] }, ""],
            },
          },
        },

        // 2️⃣ Second: calculate progress using NUMBERS
        {
          $addFields: {
            progress: {
              $cond: [
                // Case 1: allocations exist
                { $gt: ["$allocationStats.total", 0] },
                {
                  $round: [
                    {
                      $multiply: [
                        {
                          $divide: ["$allocationStats.completed", "$allocationStats.total"],
                        },
                        100,
                      ],
                    },
                    0,
                  ],
                },

                // Case 2: no allocations but project completed
                {
                  $cond: [{ $eq: ["$projectStatus", "completed"] }, 100, 0],
                },
              ],
            },
          },
        },
        { $unwind: { path: "$createdBy", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "users",
            localField: "operatedBy",
            foreignField: "_id",
            as: "operatedBy",
          },
        },
        { $unwind: { path: "$operatedBy", preserveNullAndEmptyArrays: true } },
        progressProjectStage,
        { $match: search },
        {
          $facet: {
            totalCount: [{ $count: "count" }],
            data: [{ $sort: sort }, { $skip: page * pageSize }, { $limit: pageSize }],
          },
        },
      ]);

      const totalCount = project?.[0].totalCount?.[0]?.count || 0;
      const rows = project?.[0]?.data;
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
  projects: async (req, res, next) => {
    try {
      //apply sort, search, pagination
      let search = {};
      let userId = req.session.userId;

      let organizationId = req.session.organizationId;

      let match = {
        active: true,
      };
      if (!UtilController.isEmpty(organizationId)) {
        match["organizationId"] = mongoose.Types.ObjectId(organizationId);
      }

      let sort = {};

      sort = { updatedAt: -1 };

      const project = await Project.aggregate([
        { $match: match },
        {
          $lookup: {
            from: "customers",
            localField: "customerId",
            foreignField: "_id",
            as: "customerId",
          },
        },
        {
          $unwind: {
            path: "$customerId",
            preserveNullAndEmptyArrays: true,
          },
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
        // {
        //   $lookup: {
        //     from: "users",
        //     localField: "projectHead",
        //     foreignField: "_id",
        //     as: "projectHead",
        //   },
        // },
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
            _id: 1,
            projectTagId: 1,
            customerId: "$customerId._id",
            companyName: "$customerId.companyName",
            country: "$customerId.country",
            customerName: 1,
            projectName: 1,
            projectDescription: 1,
            startDate: 1,
            endDate: 1,
            projectStatus: 1,
            // projectHead: "$projectHead",
            team: {
              $map: {
                input: "$team",
                as: "u",
                in: {
                  _id: "$$u._id",
                  fname: "$$u.fname",
                  lname: "$$u.lname",
                  profileImage: "$$u.profileImage",
                },
              },
            },
            note: 1,
            createdAt: 1,
            updatedAt: 1,
            taskName: 1,
            companyName: "$customerId.companyName",
            createdBy: {
              $concat: [{ $ifNull: ["$createdBy.fname", ""] }, " ", { $ifNull: ["$createdBy.lname", ""] }],
            },
            operatedBy: {
              $concat: [{ $ifNull: ["$operatedBy.fname", ""] }, " ", { $ifNull: ["$operatedBy.lname", ""] }],
            },
            organization: { organizationName: 1, _id: 1 },
            organizationName: "$organization.organizationName",
            customerName: "$customerId.customerName",
          },
        },
        { $match: search },
        {
          $facet: {
            totalCount: [{ $count: "count" }],
            data: [{ $sort: sort }],
          },
        },
      ]);
      const totalCount = project?.[0].totalCount?.[0] ? project[0].totalCount[0].count : 0;
      const rows = project?.[0]?.data;
      //const pages = Math.ceil(totalCount / pageSize);

      UtilController.sendSuccess(req, res, next, {
        rows: rows,
        filterRecords: totalCount,
        // pages: pages,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
  projectById: async (req, res, next) => {
    try {
      const project = await Project.findById(req.body.projectId)
        .populate("customerId", "companyName")
        .populate("organizationId", "organizationName organizationTagId")
        .populate("projectHead", "fname lname employeeId")
        .populate("team", "fname lname employeeId")
        .populate("createdBy", "fname lname")
        .populate("operatedBy", "fname lname");

      UtilController.sendSuccess(req, res, next, { project });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },
  dropdownProject: async (req, res, next) => {
    try {
      let taskName = req.body.taskName;
      let userId = req.session.userId;
      let userType = req.session.userType;
      let module = req.body.module;

      let search = {};
      if (!UtilController.isEmpty(req.body.keyword)) {
        search["$or"] = [
          { projectName: { $regex: req.body.keyword, $options: "i" } },
          { projectTagId: { $regex: req.body.keyword, $options: "i" } },
        ];
      }

      let match = {
        active: true,
      };

      if (!UtilController.isEmpty(req.session.organizationId)) {
        match["organizationId"] = mongoose.Types.ObjectId(req.session.organizationId);
      }

      if (!UtilController.isEmpty(req.body.organizationId)) {
        match["organizationId"] = mongoose.Types.ObjectId(req.body.organizationId);
      }

      if (!UtilController.isEmpty(req.body.managerIds) && Array.isArray(req.body.managerIds)) {
        const managerObjectIds = req.body.managerIds.map(id => mongoose.Types.ObjectId(id));
        match["$or"] = [{ projectHead: { $in: managerObjectIds } }, { team: { $in: managerObjectIds } }];
      } else if (!UtilController.isEmpty(userType) && userType?.toLowerCase() === "employee") {
        const projectIdsFromAllocations = await WorkAllocation.distinct("projectId", {
          employeeId: mongoose.Types.ObjectId(userId),
          active: true,
        });
        match["$or"] = [{ _id: { $in: projectIdsFromAllocations } }, { createdBy: mongoose.Types.ObjectId(userId) }];
      } else if (
        !UtilController.isEmpty(userType) &&
        (userType?.toLowerCase() == "manager" || userType?.toLowerCase() == "tls")
      ) {
        match["$or"] = [
          { projectHead: mongoose.Types.ObjectId(userId) },
          { team: mongoose.Types.ObjectId(userId) },
          { createdBy: mongoose.Types.ObjectId(userId) },
        ];
      } else if (!UtilController.isEmpty(module) && module == "timesheet") {
        let getReportingManager = await User.findById(userId).select("reportedTo");
        if (!UtilController.isEmpty(getReportingManager)) {
          if (!UtilController.isEmpty(getReportingManager.reportedTo)) {
            let getReportingManagerId = await User.findOne({
              employeeId: getReportingManager.reportedTo,
            }).select("_id");

            match["$or"] = [
              { projectHead: mongoose.Types.ObjectId(getReportingManagerId?._id) },
              { projectHead: mongoose.Types.ObjectId(userId) },
              { team: mongoose.Types.ObjectId(userId) },
            ];
          }
        }
      }

      let sort = { updatedAt: -1 };
      let pageSize = req.body.pageSize || 50;
      let page = req.body.page || 0;

      const pipeline = [
        { $match: match },
        {
          $lookup: {
            from: "users",
            localField: "projectHead",
            foreignField: "_id",
            as: "projectHead",
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "team",
            foreignField: "_id",
            as: "team",
          },
        },
        {
          $project: {
            projectName: 1,
            projectNumber: 1,
            projectTagId: 1,
            estimatedHours: 1,
            projectHours: 1,
            startDate: 1,
            endDate: 1,
            projectHead: "$projectHead",
            team: "$team",
            createdAt: 1,
            updatedAt: 1,
          },
        },
        { $match: search },
        {
          $facet: {
            totalCount: [{ $count: "count" }],
            data: [{ $sort: sort }, { $skip: page * pageSize }, { $limit: pageSize }],
          },
        },
      ];

      const project = await Project.aggregate(pipeline);
      const totalCount = project[0].totalCount[0] ? project[0].totalCount[0].count : 0;
      const rows = project[0].data;
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
  dropDownProjectStatus: async (req, res, next) => {
    const result = {
      open: "Open",
      allocated: "Allocated",
      completed: "Completed",
      on_hold: "On Hold",
      reopened: "Reopened",
      archived: "Archived",
    };
    try {
      UtilController.sendSuccess(req, res, next, {
        result,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
  createdByDropdown: async (req, res, next) => {
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
      let result = await Project.aggregate(pipeline);

      // Send success response
      UtilController.sendSuccess(req, res, next, {
        result,
      });
    } catch (err) {
      console.error(err);
      UtilController.sendError(req, res, next, err);
    }
  },
  //listing all managers accrording to project name
  listDownProjectHeadByProjectId: async (req, res, next) => {
    try {
      const { projectId, keyword } = req.body;

      if (!projectId) {
        throw new Error("Project ID is required");
      }

      const pipeline = [
        {
          $match: {
            _id: mongoose.Types.ObjectId(projectId),
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "projectHead",
            foreignField: "_id",
            as: "projectHeads",
          },
        },
        {
          $unwind: {
            path: "$projectHeads",
            preserveNullAndEmptyArrays: false,
          },
        },
        ...(keyword
          ? [
              {
                $match: {
                  $or: [
                    { "projectHeads.fname": { $regex: keyword, $options: "i" } }, // Match first name
                    { "projectHeads.lname": { $regex: keyword, $options: "i" } }, // Match last name
                  ],
                },
              },
            ]
          : []),
        {
          $group: {
            _id: "$projectHeads._id",
            fname: { $first: "$projectHeads.fname" },
            lname: { $first: "$projectHeads.lname" },
          },
        },
        {
          $sort: { fname: 1 },
        },
        {
          $project: {
            _id: 1,
            fname: 1,
            lname: 1,
            profileImage: 1,
          },
        },
      ];

      let result = await Project.aggregate(pipeline);

      UtilController.sendSuccess(req, res, next, {
        result,
      });
    } catch (err) {
      console.error(err);
      UtilController.sendError(req, res, next, err);
    }
  },
  getAllWorkAllocationsForProjects: async (req, res, next) => {
    try {
      const organizationId = req.session.organizationId;

      if (UtilController.isEmpty(organizationId)) {
        return UtilController.sendError(req, res, next, {
          message: "Organization ID is required",
        });
      }

      // Build match criteria for projects
      const projectMatch = {
        active: true,
        organizationId: mongoose.Types.ObjectId(organizationId),
      };

      // Optional: filter by specific project IDs if provided
      if (!UtilController.isEmpty(req.body.projectIds) && Array.isArray(req.body.projectIds)) {
        projectMatch._id = {
          $in: req.body.projectIds.map(id => mongoose.Types.ObjectId(id)),
        };
      }

      // Start from Projects, not WorkAllocations
      const result = await Project.aggregate([
        { $match: projectMatch },

        // Get project heads
        {
          $lookup: {
            from: "users",
            localField: "projectHead",
            foreignField: "_id",
            as: "projectHeadDetails",
          },
        },

        // Get team members
        {
          $lookup: {
            from: "users",
            localField: "team",
            foreignField: "_id",
            as: "teamDetails",
          },
        },

        // Get work allocations for this project
        {
          $lookup: {
            from: "workallocations",
            let: { projectId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [{ $eq: ["$projectId", "$$projectId"] }, { $eq: ["$active", true] }],
                  },
                },
              },
              {
                $lookup: {
                  from: "users",
                  localField: "employeeId",
                  foreignField: "_id",
                  as: "employeeDetails",
                },
              },
              { $unwind: { path: "$employeeDetails", preserveNullAndEmptyArrays: false } },
              {
                $project: {
                  _id: "$employeeDetails._id",
                  fname: "$employeeDetails.fname",
                  lname: "$employeeDetails.lname",
                  profileImage: "$employeeDetails.profileImage",
                  employeeId: "$employeeDetails.employeeId",
                },
              },
            ],
            as: "allocationEmployees",
          },
        },

        // Merge all employee data and remove duplicates
        {
          $project: {
            projectId: "$_id",
            employeeDetails: {
              $reduce: {
                input: {
                  $concatArrays: [
                    // Map project heads
                    {
                      $map: {
                        input: "$projectHeadDetails",
                        as: "head",
                        in: {
                          _id: "$$head._id",
                          fname: "$$head.fname",
                          lname: "$$head.lname",
                          profileImage: "$$head.profileImage",
                          employeeId: "$$head.employeeId",
                        },
                      },
                    },
                    // Map team members
                    {
                      $map: {
                        input: "$teamDetails",
                        as: "team",
                        in: {
                          _id: "$$team._id",
                          fname: "$$team.fname",
                          lname: "$$team.lname",
                          profileImage: "$$team.profileImage",
                          employeeId: "$$team.employeeId",
                        },
                      },
                    },
                    // Add allocation employees
                    "$allocationEmployees",
                  ],
                },
                initialValue: [],
                in: {
                  $cond: [
                    // Check if employee already exists (deduplicate)
                    {
                      $in: ["$$this._id", { $map: { input: "$$value", as: "v", in: "$$v._id" } }],
                    },
                    "$$value",
                    { $concatArrays: ["$$value", ["$$this"]] },
                  ],
                },
              },
            },
          },
        },
      ]);

      UtilController.sendSuccess(req, res, next, {
        result: result,
        responseCode: returnCode.validSession,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
};
