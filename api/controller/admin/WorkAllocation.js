let request = require("request");
let mongoose = require("mongoose");
var CryptoJS = require("crypto-js");
const WorkAllocations = require("../../models/WorkAllocations");
const Notification = require("../../models/Notification");
const Tag = require("../../models/Tag");
const UtilController = require("../services/UtilController");
const responseCode = require("../../../config/responseCode");
const AllocationActivityComments = require("../../models/AllocationActivityComments");
const returnCode = require("../../../config/responseCode").returnCode;
const Document = require("../../models/Pr");
const User = require("../../models/User");
module.exports = {
  listAllAllocations: async (req, res, next) => {
    try {
      //apply sort, search, pagination
      let search = {};
      let userId = req.session.userId;
      let isSuperAdmin = req.session.isSuperAdmin;
      let userType = req.session.userType;
      let organizationId = req.session.organizationId;
      if (!UtilController.isEmpty(req.body.keyword)) {
        const keyword = req.body.keyword;
        search["$or"] = [
          { domain: { $regex: keyword, $options: "i" } },
          { subActivityName: { $regex: keyword, $options: "i" } },
          { activityName: { $regex: keyword, $options: "i" } },
          { taskName: { $regex: keyword, $options: "i" } },
          { tagId: { $regex: keyword, $options: "i" } },
          {
            $expr: {
              $regexMatch: {
                input: { $concat: [{ $arrayElemAt: ["$employeeId.fname", 0] }] },
                regex: keyword,
                options: "i",
              },
            },
          },
          {
            $expr: {
              $regexMatch: {
                input: { $concat: [{ $arrayElemAt: ["$projectId.projectName", 0] }] },
                regex: keyword,
                options: "i",
              },
            },
          },
          {
            $expr: {
              $regexMatch: {
                input: { $concat: [{ $arrayElemAt: ["$managerId.fname", 0] }] },
                regex: keyword,
                options: "i",
              },
            },
          },
          { projectName: { $regex: keyword, $options: "i" } },
        ];
      }


      let match = {
        active: true,
      };

      if (!UtilController.isEmpty(organizationId)) {
        match["organizationId"] = mongoose.Types.ObjectId(organizationId);
      }
      if (!UtilController.isEmpty(req.body.active)) match["active"] = req.body.active;
      if (!UtilController.isEmpty(organizationId)) match["organizationId"] = new mongoose.Types.ObjectId(organizationId);
      //showing the results based on userType and organization
      if (!UtilController.isEmpty(userId) && !isSuperAdmin && userType?.toLowerCase() === "employee") {
        match["$or"] = [
          { employeeId: { $in: [new mongoose.Types.ObjectId(userId)] } },
          { createdBy: new mongoose.Types.ObjectId(userId) },
        ];
        match["organizationId"] = new mongoose.Types.ObjectId(organizationId);
      }
      if (
        !UtilController.isEmpty(userId) &&
        !isSuperAdmin &&
        (userType?.toLowerCase() === "manager" || userType?.toLowerCase() === "tls")
      ) {
        match["$or"] = [
          { managerId: { $in: [new mongoose.Types.ObjectId(userId)] } },
          { createdBy: new mongoose.Types.ObjectId(userId) },
        ];
        match["organizationId"] = new mongoose.Types.ObjectId(organizationId);
      }
      if (!UtilController.isEmpty(userId) && !isSuperAdmin && userType?.toLowerCase() === "organization admin") {
        match["organizationId"] = new mongoose.Types.ObjectId(organizationId);
      }
      if (!UtilController.isEmpty(req.body.startDate) || !UtilController.isEmpty(req.body.endDate)) {
        match["$and"] = [];
        if (!UtilController.isEmpty(req.body.startDate)) {
          match["$and"].push({ createdAt: { $gte: req.body.startDate } });
        }
        if (!UtilController.isEmpty(req.body.endDate)) {
          match["$and"].push({ createdAt: { $lte: req.body.endDate } });
        }
        if (!UtilController.isEmpty(req.body.taskStatus)) {
          match["$and"].push({ taskStatus: req.body.taskStatus });
        }
        if (!UtilController.isEmpty(req.body.taskPriority)) {
          match["$and"].push({ priority: req.body.taskPriority });
        }
      }
      // Filter by `createdBy`
      if (!UtilController.isEmpty(req.body.createdBy)) {
        match["createdBy"] = mongoose.Types.ObjectId(req.body.createdBy);
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

      const allocationData = await WorkAllocations.aggregate([
        { $match: match },

        {
          $lookup: {
            from: "users",
            localField: "managerId",
            foreignField: "_id",
            as: "managerDetails",
          },
        },

        {
          $lookup: {
            from: "activities",
            localField: "subActivityId",
            foreignField: "_id",
            as: "subActivity",
          },
        },
        { $unwind: { path: "$subActivity", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "activities",
            localField: "activity",
            foreignField: "_id",
            as: "activityDetails",
          },
        },
        { $unwind: { path: "$activityDetails", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "projects",
            localField: "projectId",
            foreignField: "_id",
            as: "project",
          },
        },
        { $unwind: { path: "$project", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "organizations",
            localField: "organizationId",
            foreignField: "_id",
            as: "organizationId",
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
          $lookup: {
            from: "users",
            localField: "updatedBy",
            foreignField: "_id",
            as: "updatedByDetails",
          },
        },
        {
          $unwind: {
            path: "$updatedByDetails",
            preserveNullAndEmptyArrays: true,
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
        { $unwind: { path: "$operatedByDetails", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "users",
            localField: "employeeId",
            foreignField: "_id",
            as: "employeeDetails",
          },
        },

        {
          $project: {
            createdAt: 1,
            updatedAt: 1,
            startDateTime: 1,
            endDateTime: 1,
            duration: 1,
            breakHour: 1,
            quantity: 1,
            taskStatus: 1,
            domains: 1,
            domainNames: 1,
            assignedPeople: { $size: "$employeeId" },
            status: 1,
            submittedAt: 1,
            priority: 1,
            managerDetails: "$managerDetails",
            createdBy: {
              $concat: [
                { $ifNull: ["$createdByDetails.fname", ""] },
                " ",
                { $ifNull: ["$createdByDetails.lname", ""] },
              ],
            },
            operatedBy: {
              $concat: [
                { $ifNull: ["$operatedByDetails.fname", ""] },
                " ",
                { $ifNull: ["$operatedByDetails.lname", ""] },
              ],
            },
            updatedBy: {
              $concat: [
                { $ifNull: ["$updatedByDetails.fname", ""] },
                " ",
                { $ifNull: ["$updatedByDetails.lname", ""] },
              ],
            },
            activityName: "$activityDetails.name",
            quantity: 1,
            duration: 1,
            assignedPeople: { $size: "$employeeId" },
            projectId: 1,
            projectName: "$project.projectName",
            subActivityName: "$subActivity.name",
            employeeDetails: "$employeeDetails",
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
      const totalCount = allocationData[0].totalCount[0] ? allocationData[0].totalCount[0].count : 0;
      const rows = allocationData[0].data;
      const pages = Math.ceil(totalCount / pageSize);

      UtilController.sendSuccess(req, res, next, {
        result: rows,
        filterRecords: totalCount,
        pages: pages,
        responseCode: returnCode.validSession,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
  getAllocationById: async (req, res, next) => {
    try {
      let recordId = req.body.recordId;
      if (UtilController.isEmpty(recordId)) {
        return UtilController.sendError(req, res, next, {
          message: "Record id is required",
        });
      }

      const allocationData = await WorkAllocations.aggregate([
        {
          $match: {
            _id: mongoose.Types.ObjectId(recordId),
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
            from: "users",
            localField: "employeeId",
            foreignField: "_id",
            as: "employeeId",
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
          $lookup: {
            from: "users",
            localField: "managerId",
            foreignField: "_id",
            as: "managerId",
          },
        },
        {
          $lookup: {
            from: "activities",
            localField: "subActivityId",
            foreignField: "_id",
            as: "subActivityId",
          },
        },
        {
          $lookup: {
            from: "activities",
            localField: "activity",
            foreignField: "_id",
            as: "activity",
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
          $unwind: { path: "$projectId", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "users",
            localField: "projectId.operatedBy",
            foreignField: "_id",
            as: "projectOperatedBy",
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "projectId.createdBy",
            foreignField: "_id",
            as: "projectCreatedBy",
          },
        },
        {
          $lookup: {
            from: "organizations",
            localField: "projectId.organizationId",
            foreignField: "_id",
            as: "projectOrganization",
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "projectId.customerId",
            foreignField: "_id",
            as: "projectCustomer",
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "projectId.projectHead",
            foreignField: "_id",
            as: "projectHead",
          },
        },
        {
          $lookup: {
            from: "domains",
            localField: "domains",
            foreignField: "_id",
            as: "domainDetails",
          },
        },
        {
          $project: {
            _id: 1,
            createdBy: 1,
            employeeId: 1,
            managerId: 1,
            subActivityId: 1,
            activity: 1,
            projectId: {
              _id: "$projectId._id",
              active: "$projectId.active",
              projectStatus: "$projectId.projectStatus",
              projectTagId: "$projectId.projectTagId",
              projectName: "$projectId.projectName",
              projectHead: "$projectHead",
              projectDescription: "$projectId.projectDescription",
              projectOrganization: "$projectOrganization",
              startDate: "$projectId.startDate",
              endDate: "$projectId.endDate",
              operatedBy: 1,
              createdBy: 1,
              organizationId: 1,
              customerId: 1,
            },
            domains: "$domains",
            domainDetails: "$domainDetails",
            domainNames: 1,
            activityName: 1,
            subActivityName: 1,
            tagId: 1,
            quantity: 1,
            priority: 1,
            status: 1,
            startDateTime: 1,
            endDateTime: 1,
            attachment: 1,
            workDescription: 1,
            taskStatus: 1,
            taskType: 1,
            duration: 1,
            breakHour: 1,
            organizationId: 1,
            operatedBy: 1,
            createdAt: 1,
            updatedAt: 1,
            active: 1,
            taskName: 1,
          },
        },
      ]);

      // Check if no records found
      if (!allocationData.length) {
        return UtilController.sendError(req, res, next, {
          message: "Allocation not found",
        });
      }

      UtilController.sendSuccess(req, res, next, { result: allocationData[0], responseCode: returnCode.validSession });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
  updateWorkAllocation: async (req, res, next) => {
    try {
      let recordId = req.body.recordId;
      if (UtilController.isEmpty(recordId)) {
        return UtilController.sendError(req, res, next, {
          message: "Record id is required",
        });
      }

      let updateObj = req.body;
      updateObj["updatedAt"] = Math.floor(Date.now() / 1000);
      updateObj["updatedBy"] = req.session.userId;

      // Sanitize ObjectId fields - Extract only IDs from objects/arrays
      if (updateObj.createdBy) {
        if (Array.isArray(updateObj.createdBy)) {
          updateObj.createdBy = new mongoose.Types.ObjectId(updateObj.createdBy[0]._id || updateObj.createdBy[0]);
        } else if (typeof updateObj.createdBy === "object" && updateObj.createdBy._id) {
          updateObj.createdBy = new mongoose.Types.ObjectId(updateObj.createdBy._id);
        } else if (typeof updateObj.createdBy === "string") {
          updateObj.createdBy = new mongoose.Types.ObjectId(updateObj.createdBy);
        }
      }

      if (updateObj.employeeId && Array.isArray(updateObj.employeeId)) {
        updateObj.employeeId = updateObj.employeeId.map(emp => {
          if (typeof emp === "object" && emp._id) {
            return new mongoose.Types.ObjectId(emp._id);
          }
          return new mongoose.Types.ObjectId(emp);
        });
      }

      if (updateObj.managerId && Array.isArray(updateObj.managerId)) {
        updateObj.managerId = updateObj.managerId.map(manager => {
          if (typeof manager === "object" && manager._id) {
            return new mongoose.Types.ObjectId(manager._id);
          }
          return new mongoose.Types.ObjectId(manager);
        });
      }

      if (updateObj.projectId) {
        if (typeof updateObj.projectId === "object" && updateObj.projectId._id) {
          updateObj.projectId = new mongoose.Types.ObjectId(updateObj.projectId._id);
        } else if (typeof updateObj.projectId === "string") {
          updateObj.projectId = new mongoose.Types.ObjectId(updateObj.projectId);
        }
      }

      if (updateObj.activity) {
        if (typeof updateObj.activity === "object" && updateObj.activity._id) {
          updateObj.activity = new mongoose.Types.ObjectId(updateObj.activity._id);
        } else if (typeof updateObj.activity === "string") {
          updateObj.activity = new mongoose.Types.ObjectId(updateObj.activity);
        }
      }

      if (updateObj.subActivityId) {
        if (typeof updateObj.subActivityId === "object" && updateObj.subActivityId._id) {
          updateObj.subActivityId = new mongoose.Types.ObjectId(updateObj.subActivityId._id);
        } else if (typeof updateObj.subActivityId === "string") {
          updateObj.subActivityId = new mongoose.Types.ObjectId(updateObj.subActivityId);
        }
      }

      if (updateObj.organizationId) {
        if (typeof updateObj.organizationId === "object" && updateObj.organizationId._id) {
          updateObj.organizationId = new mongoose.Types.ObjectId(updateObj.organizationId._id);
        } else if (typeof updateObj.organizationId === "string") {
          updateObj.organizationId = new mongoose.Types.ObjectId(updateObj.organizationId);
        }
      }

      if (Array.isArray(req.body.domains) && req.body.domains.length > 0) {
        updateObj.domains = req.body.domains.map(id => new mongoose.Types.ObjectId(id));

        if (Array.isArray(req.body.domainNames)) {
          updateObj.domainNames = req.body.domainNames;
        }
      } else {
        updateObj.domains = [];
        updateObj.domainNames = [];
      }

      const allocationData = await WorkAllocations.findByIdAndUpdate(recordId, updateObj, { new: true }).populate(
        "projectId activity",
      );

      // Rest of your code remains the same...
      if (!UtilController.isEmpty(req.body.attachment)) {
        const commentFilter = {
          activity: new mongoose.Types.ObjectId(allocationData?.activity?._id),
          workAllocationId: new mongoose.Types.ObjectId(allocationData?._id),
          createdBy: new mongoose.Types.ObjectId(req.session.userId),
        };
        const commentData = {
          attachments: Array.isArray(req.body.attachment)
            ? req.body.attachment.map(link => (typeof link === "string" ? { url: link } : link))
            : [],
          content: req.body.workDescription,
        };
        console.log(commentData, "from comment");
        await AllocationActivityComments.findOneAndUpdate(commentFilter, { $set: commentData });
      }

      // Notifications code remains the same...
      if (Array.isArray(allocationData?.managerId)) {
        await Promise.all(
          allocationData.managerId.map(managerId =>
            Notification.create({
              userType: "manager",
              recordId: allocationData?._id,
              userId: managerId,
              title: `Allocation Update: ${allocationData?.activity?.name}`,
              body: `The allocation ${allocationData?.activity?.name} has been updated. Click to review the changes.`,
              type: "system",
              read: false,
              visibleOnHome: true,
              actionUrl: `/workallocation?id=${allocationData._id}`,
            }),
          ),
        );
      }

      if (Array.isArray(allocationData?.employeeId)) {
        await Promise.all(
          allocationData.employeeId.map(employee =>
            Notification.create({
              userType: "employee",
              recordId: allocationData?._id,
              userId: employee,
              title: `Allocation Update: ${allocationData?.activity?.name}`,
              body: `The allocation ${allocationData?.activity?.name} has been updated. Click to review the changes.`,
              type: "system",
              read: false,
              visibleOnHome: true,
              actionUrl: `/workallocation?id=${allocationData._id}`,
            }),
          ),
        );
      }

      await Notification.create({
        userType: "organizationAdmin",
        recordId: allocationData?._id,
        userId: allocationData?.organizationId,
        title: `Allocation Update: ${allocationData?.activity?.name}`,
        body: `The allocation ${allocationData?.activity?.name} has been updated. Click to review the changes.`,
        type: "system",
        read: false,
        visibleOnHome: true,
        actionUrl: `/workallocation?id=${allocationData._id}`,
      });

      UtilController.sendSuccess(req, res, next, { allocationData, responseCode: returnCode.validSession });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
  deleteWorkAllocation: async (req, res, next) => {
    try {
      let recordIds = req.body.recordIds;
      if (!Array.isArray(recordIds) || recordIds.length === 0) {
        return UtilController.sendError(req, res, next, {
          message: "An array of record IDs is required",
        });
      }

      let updateObj = {
        active: false,
        updatedAt: Math.floor(Date.now() / 1000),
        updatedBy: req.session.userId,
      };

      const allocationData = await WorkAllocations.updateMany({ _id: { $in: recordIds } }, updateObj);

      UtilController.sendSuccess(req, res, next, {
        updatedCount: allocationData.modifiedCount,
        responseCode: returnCode.validSession,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },

  listAllocationTaskNames: async (req, res, next) => {
    try {
      let organizationId = req.session.organizationId;
      let bodyOrgId = req.body.organizationId;
      if (!UtilController.isEmpty(bodyOrgId)) organizationId = bodyOrgId;
      //also its searchable by task name
      let keyword = req.body.keyword ?? "";
      let search = {
        organizationId: organizationId,
        active: true,
      };
      if (!UtilController.isEmpty(keyword)) {
        search["$or"] = [{ taskName: { $regex: keyword, $options: "i" } }];
      }
      let taskNames = await WorkAllocations.find(search)
        .select("taskName")
        .sort({
          createdAt: -1,
        })
        .limit(10);
      UtilController.sendSuccess(req, res, next, { taskNames });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },

  // API to get all users for dropdown selection with search keyword
  queryCreatedByUsers: async (req, res, next) => {
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
      let result = await WorkAllocations.aggregate(pipeline);

      // Send success response
      UtilController.sendSuccess(req, res, next, {
        result,
      });
    } catch (err) {
      console.error(err);
      UtilController.sendError(req, res, next, err);
    }
  },

  //API (PRs)

  createDocument: async (req, res, next) => {
    try {
      const { content, workAllocationId } = req.body;
      const document = await Document.create({
        content,
        workAllocationId,
      });
      UtilController.sendSuccess(req, res, next, {
        document,
      });
    } catch (err) {
      console.error(err);
      UtilController.sendError(req, res, next, err);
    }
  },

  getDocument: async (req, res, next) => {
    try {
      // Change from req.query to req.body
      const { workAllocationId, activityId } = req.body;

      const document = await Document.findOne({
        workAllocationId,
      });

      if (!document) {
        return UtilController.sendSuccess(req, res, next, {
          document: null,
        });
      }

      UtilController.sendSuccess(req, res, next, {
        document,
      });
    } catch (err) {
      console.error(err);
      UtilController.sendError(req, res, next, err);
    }
  },

  getDocumentById: async (req, res, next) => {
    try {
      const document = await Document.findById(req.params.id);
      if (!document) {
        return res.status(404).json({ success: false, error: "Document not found" });
      }
      UtilController.sendSuccess(req, res, next, {
        document,
      });
    } catch (err) {
      console.error(err);
      UtilController.sendError(req, res, next, err);
    }
  },

  updateDocument: async (req, res, next) => {
    try {
      const { documentId, content, workAllocationId } = req.body;

      const document = await Document.findByIdAndUpdate(documentId, { content, workAllocationId }, { new: true });

      if (!document) {
        return res.status(404).json({ success: false, error: "Document not found" });
      }

      UtilController.sendSuccess(req, res, next, {
        document,
      });
    } catch (err) {
      console.error(err);
      UtilController.sendError(req, res, next, err);
    }
  },

  deleteDocument: async (req, res, next) => {
    try {
      const document = await Document.findByIdAndDelete(req.params.id);
      if (!document) {
        return res.status(404).json({ success: false, error: "Document not found" });
      }
      UtilController.sendSuccess(req, res, next, {
        document,
      });
    } catch (err) {
      console.error(err);
      UtilController.sendError(req, res, next, err);
    }
  },

  taskCount: async (req, res, next) => {
    try {
      const currentTime = Math.floor(Date.now() / 1000);
      const taskCounts = await WorkAllocations.aggregate([
        {
          $match: {
            active: true,
          },
        },
        {
          $group: {
            _id: {
              taskStatus: "$taskStatus",
              missedDueDates: { $lt: ["$endDateTime", currentTime] },
            },
            count: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: null,
            completedTaskCount: {
              $sum: {
                $cond: [{ $eq: ["$_id.taskStatus", "Completed"] }, "$count", 0],
              },
            },
            inProgressTaskCount: {
              $sum: {
                $cond: [{ $eq: ["$_id.taskStatus", "pending"] }, "$count", 0],
              },
            },
            missedDueDatesCount: {
              $sum: {
                $cond: [
                  {
                    $and: [{ $ne: ["$_id.taskStatus", "Completed"] }, { $eq: ["$_id.missedDueDates", true] }],
                  },
                  "$count",
                  0,
                ],
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            completedTaskCount: 1,
            inProgressTaskCount: 1,
            missedDueDatesCount: 1,
          },
        },
      ]);

      const taskData = taskCounts[0] || { completedTaskCount: 0, inProgressTaskCount: 0, missedDueDatesCount: 0 };

      const responseData = [
        {
          title: "Total Tasks",
          value: taskData.completedTaskCount + taskData.inProgressTaskCount + taskData.missedDueDatesCount,
        },
        { title: "Completed Task", value: taskData.completedTaskCount },
        { title: "In Progress Task", value: taskData.inProgressTaskCount },
        { title: "Over Due Task", value: taskData.missedDueDatesCount },
      ];
      UtilController.sendSuccess(req, res, next, responseData);
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },

  taskDeadlines: async (req, res, next) => {
    try {
      const { search = "", status = "All" } = req.body;

      const matchStage = {};

      if (search) {
        matchStage.taskName = {
          $regex: search,
          $options: "i",
        };
      }

      const statusFilterStage = status !== "All" ? { $match: { status: status } } : null;

      const pipeline = [
        Object.keys(matchStage).length ? { $match: matchStage } : null,

        {
          $lookup: {
            from: "users",
            localField: "employeeId",
            foreignField: "_id",
            as: "employees",
          },
        },

        {
          $addFields: {
            dueDateObj: {
              $toDate: {
                $multiply: [{ $toLong: "$endDateTime" }, 1000],
              },
            },
            todayDate: {
              $dateTrunc: { date: new Date(), unit: "day" },
            },
          },
        },

        {
          $addFields: {
            dueDateOnly: {
              $dateTrunc: { date: "$dueDateObj", unit: "day" },
            },
          },
        },

        {
          $addFields: {
            dayDiff: {
              $dateDiff: {
                startDate: "$todayDate",
                endDate: "$dueDateOnly",
                unit: "day",
              },
            },
          },
        },

        {
          $addFields: {
            overdueText: {
              $cond: [
                { $eq: ["$dayDiff", 0] },
                "Today",
                {
                  $cond: [
                    { $gt: ["$dayDiff", 0] },
                    { $concat: ["in ", { $toString: "$dayDiff" }, " day"] },
                    {
                      $concat: ["by ", { $toString: { $abs: "$dayDiff" } }, " day"],
                    },
                  ],
                },
              ],
            },

            status: {
              $cond: [
                { $eq: ["$dayDiff", 0] },
                "Due Today",
                {
                  $cond: [{ $gt: ["$dayDiff", 0] }, "Upcoming", "Overdue"],
                },
              ],
            },
          },
        },

        statusFilterStage,

        {
          $project: {
            taskName: 1,
            startDateTime: 1,
            endDateTime: 1,

            dueDate: {
              $dateToString: {
                format: "%b %d %Y",
                date: "$dueDateObj",
              },
            },

            overdueText: 1,
            status: 1,

            employees: {
              _id: 1,
              fname: 1,
              lname: 1,
              profileImage: 1,
              position: 1,
            },
          },
        },
      ].filter(Boolean);

      const result = await WorkAllocations.aggregate(pipeline);

      UtilController.sendSuccess(req, res, next, result);
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },
};
