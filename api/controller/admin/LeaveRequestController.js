let request = require("request");
let mongoose = require("mongoose");
const Pos = require("../../models/Po");
const { parsePhoneNumberFromString } = require("libphonenumber-js");
const UtilController = require("../services/UtilController");
const Quote = require("../../models/Quote");
const LeaveRequest = require("../../models/LeaveRequest");
const Notification = require("../../models/Notification");
const User = require("../../models/User");
const returnCode = require("../../../config/responseCode").returnCode;

module.exports = {
  createLeaveRequest: async (req, res) => {
    try {
      const {
        employeeName,
        employeeId,
        employeeCode,
        managerId,
        leaveTypeId,
        leaveType,
        startDate,
        endDate,
        totalDays,
        totalBreakHours,
        reason,
        breakDate,
        breakHours,
        breakreason,
      } = req.body;

      if (UtilController.isEmpty(req.session.organizationId)) throw { message: "Organization Id is required" };

      const newLeaveRequest = new LeaveRequest({
        organizationId: req.session.organizationId,
        employeeName,
        employeeId,
        employeeCode,
        managerId,
        leaveTypeId,
        leaveType,
        startDate,
        endDate,
        totalDays,
        totalBreakHours,
        breakDate,
        breakHours,
        breakreason,
        reason,
        status: "Pending",
        createdBy: null,
      });

      const savedLeaveRequest = await newLeaveRequest.save();

      // Get employee details for notification
      const employee = await User.findById(employeeId);
      const employeeFullName = employee
        ? `${employee.fname || ""} ${employee.lname || ""}`.trim() || employeeName
        : employeeName;

      // Handle managerId - it can be a single ID or an array
      const managerIds = Array.isArray(managerId) ? managerId : [managerId];
      const managerNotifications = [];

      // Create notifications for all managers
      for (const mgrId of managerIds) {
        if (!mgrId) continue;

        const manager = await User.findById(mgrId);
        if (!manager) continue;

        const managerFullName = `${manager.fname || ""} ${manager.lname || ""}`.trim();

        // Format dates for notification message
        const formattedStartDate = startDate
          ? new Date(startDate * 1000).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "";
        const formattedEndDate = endDate
          ? new Date(endDate * 1000).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "";

        // Determine notification message based on leave type
        let notificationTitle, notificationBody;
        if (leaveType?.toLowerCase().includes("break")) {
          const formattedBreakDate = breakDate
            ? new Date(breakDate * 1000).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : "";
          notificationTitle = `Break Request from ${employeeFullName}`;
          notificationBody = `${employeeFullName} has requested a break on ${formattedBreakDate} for ${breakHours} hour(s). Reason: ${
            breakreason || "N/A"
          }`;
        } else {
          notificationTitle = `Leave Request from ${employeeFullName}`;
          notificationBody = `${employeeFullName} has requested ${
            leaveType || "leave"
          } from ${formattedStartDate} to ${formattedEndDate} (${totalDays} day(s)). Reason: ${reason || "N/A"}`;
        }

        const notification = await Notification.create({
          userId: mgrId,
          senderId: employeeId,
          title: notificationTitle,
          body: notificationBody,
          type: "system",
          read: false,
          visibleOnHome: true,
          actionUrl: `/leave-requests?id=${savedLeaveRequest._id}`,
          recordId: savedLeaveRequest._id,
          userType: manager.userType?.toLowerCase() || "manager",
          organizationId: req.session.organizationId,
        });

        managerNotifications.push(notification);
      }

      res.status(201).json({
        message: "Leave Request created successfully",
        data: savedLeaveRequest,
      });
    } catch (error) {
      res.status(500).json({
        message: "Error creating Leave Request",
        error: error.message,
      });
    }
  },

  deleteLeaveRequest: async (req, res, next) => {
    try {
      let leaveRequestId = req.body.recordId;

      await LeaveRequest.updateMany(
        { _id: { $in: leaveRequestId } },
        {
          $set: {
            active: false,
            updatedAt: Math.floor(Date.now() / 1000),
          },
        },
        { new: true },
      );

      UtilController.sendSuccess(req, res, next, {
        message: "LeaveRequest deleted successfully",
      });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },

  getLeaveRequestById: async (req, res, next) => {
    try {
      const recordId = req.body.recordId;
      let organizationId;

      if (!req.session.isSuperAdmin) {
        organizationId = req.session.organizationId;
      }

      if (!recordId) {
        return UtilController.sendError(req, res, next, {
          message: "Invalid LeaveRequest id",
          responseCode: returnCode.incompleteBody,
        });
      }

      let matchStage = {
        _id: mongoose.Types.ObjectId(recordId),
        active: true,
      };

      if (organizationId) {
        matchStage.organizationId = mongoose.Types.ObjectId(organizationId);
      }

      const pipeline = [
        {
          $match: matchStage,
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
        // Add lookup for manager details
        {
          $lookup: {
            from: "users",
            localField: "managerId",
            foreignField: "_id",
            as: "managerDetails",
          },
        },
        {
          $project: {
            _id: 1,
            employeeName: 1,
            employeeId: 1,
            employeeCode: 1,
            managerId: 1,
            leaveTypeId: 1,
            leaveType: 1,
            startDate: 1,
            endDate: 1,
            totalDays: 1,
            totalBreakHours: 1,
            breakDate: 1,
            breakHours: 1,
            breakreason: 1,
            reason: 1,
            status: 1,
            rejectedReason: 1,
            createdAt: 1,
            updatedAt: 1,
            organization: {
              name: "$organization.organizationName",
              _id: "$organization._id",
            },
            managerDetails: {
              $map: {
                input: "$managerDetails",
                as: "m",
                in: {
                  _id: "$$m._id",
                  fname: "$$m.fname",
                  lname: "$$m.lname",
                  fullName: {
                    $concat: [{ $ifNull: ["$$m.fname", ""] }, " ", { $ifNull: ["$$m.lname", ""] }],
                  },
                  profileImage: "$$m.profileImage",
                },
              },
            },
            corApprovedDate: 1,
          },
        },
      ];

      const [result] = await LeaveRequest.aggregate(pipeline);
      console.log("result", result);

      return UtilController.sendSuccess(req, res, next, {
        data: result,
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },

  updateLeaveRequest: async (req, res, next) => {
    try {
      const updateObj = req.body;
      if (!updateObj.leaveRequestId) {
        return UtilController.sendError(req, res, next, {
          responseCode: returnCode.incompleteBody,
          message: "leaveRequestId is required.",
        });
      }

      const leaveRequest = await LeaveRequest.findById(updateObj.leaveRequestId);
      if (!leaveRequest) {
        return UtilController.sendError(req, res, next, {
          responseCode: returnCode.recordNotFound,
          message: "Leave request not found.",
        });
      }

      const userId = req.session.userId;

      if (updateObj.status === "Approved" || updateObj.status === "Rejected") {
        const managerIds = Array.isArray(leaveRequest.managerId)
          ? leaveRequest.managerId.map(id => id.toString())
          : [leaveRequest.managerId.toString()];

        if (!managerIds.includes(userId.toString())) {
          return UtilController.sendError(req, res, next, {
            message: "You are not authorized to change the status of this request",
          });
        }

        if (updateObj.status === "Approved") {
          updateObj.approvedBy = userId;
          updateObj.approvedAt = Math.floor(Date.now() / 1000);
        } else if (updateObj.status === "Rejected") {
          updateObj.rejectedBy = userId;
          updateObj.rejectedAt = Math.floor(Date.now() / 1000);

          if (!updateObj.rejectedReason || updateObj.rejectedReason.trim() === "") {
            return UtilController.sendError(req, res, next, {
              message: "Rejection reason is required when rejecting a leave request",
            });
          }
        }
      }

      updateObj.operatedBy = userId;
      updateObj.updatedAt = Math.floor(Date.now() / 1000);

      const updatedLeaveRequest = await LeaveRequest.findByIdAndUpdate(updateObj.leaveRequestId, updateObj, {
        new: true,
      });

      if (updateObj.status === "Approved" || updateObj.status === "Rejected") {
        try {
          const manager = await User.findById(userId);
          const managerFullName = manager ? `${manager.fname || ""} ${manager.lname || ""}`.trim() : "Manager";

          const employee = await User.findById(leaveRequest.employeeId);
          const employeeFullName = employee
            ? `${employee.fname || ""} ${employee.lname || ""}`.trim() || leaveRequest.employeeName
            : leaveRequest.employeeName;

          const formattedStartDate = leaveRequest.startDate
            ? new Date(leaveRequest.startDate * 1000).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : "";
          const formattedEndDate = leaveRequest.endDate
            ? new Date(leaveRequest.endDate * 1000).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : "";

          let notificationTitle, notificationBody;

          if (updateObj.status === "Approved") {
            if (leaveRequest.leaveType?.toLowerCase().includes("break")) {
              const formattedBreakDate = leaveRequest.breakDate
                ? new Date(leaveRequest.breakDate * 1000).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "";
              notificationTitle = `Break Request Approved`;
              notificationBody = `Your break request for ${formattedBreakDate} (${leaveRequest.breakHours} hour(s)) has been approved by ${managerFullName}.`;
            } else {
              notificationTitle = `Leave Request Approved`;
              notificationBody = `Your ${
                leaveRequest.leaveType || "leave"
              } request from ${formattedStartDate} to ${formattedEndDate} (${
                leaveRequest.totalDays
              } day(s)) has been approved by ${managerFullName}.`;
            }
          } else if (updateObj.status === "Rejected") {
            if (leaveRequest.leaveType?.toLowerCase().includes("break")) {
              const formattedBreakDate = leaveRequest.breakDate
                ? new Date(leaveRequest.breakDate * 1000).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "";
              notificationTitle = `Break Request Rejected`;
              notificationBody = `Your break request for ${formattedBreakDate} (${
                leaveRequest.breakHours
              } hour(s)) has been rejected by ${managerFullName}. Reason: ${updateObj.rejectedReason || "N/A"}`;
            } else {
              notificationTitle = `Leave Request Rejected`;
              notificationBody = `Your ${
                leaveRequest.leaveType || "leave"
              } request from ${formattedStartDate} to ${formattedEndDate} (${
                leaveRequest.totalDays
              } day(s)) has been rejected by ${managerFullName}. Reason: ${updateObj.rejectedReason || "N/A"}`;
            }
          }

          await Notification.create({
            userId: leaveRequest.employeeId,
            senderId: userId,
            title: notificationTitle,
            body: notificationBody,
            type: "system",
            read: false,
            visibleOnHome: true,
            actionUrl: `/leave-requests?id=${updatedLeaveRequest._id}`,
            recordId: updatedLeaveRequest._id,
            userType: employee?.userType?.toLowerCase() || "employee",
            organizationId: leaveRequest.organizationId,
          });
        } catch (notificationError) {
          console.error("Error creating notification for leave request update:", notificationError);
        }
      }

      UtilController.sendSuccess(req, res, next, {
        message: `Leave request ${updateObj.status ? updateObj.status.toLowerCase() : "updated"} successfully.`,
        leaveRequest: updatedLeaveRequest,
        responseCode: returnCode.validSession,
      });
    } catch (error) {
      console.error("Error updating leave request:", error);
      UtilController.sendError(req, res, next, {
        message: "An error occurred while updating the leave request.",
        error: error.message,
        responseCode: returnCode.error,
      });
    }
  },

  listLeaveRequest: async (req, res, next) => {
    try {
      let search = {};
      let userId = req.session.userId;
      let userType = req.session.userType;

      if (!UtilController.isEmpty(req.body.keyword)) {
        search["$or"] = [{ employeeName: { $regex: req.body.keyword, $options: "i" } }];
      }

      let match = {
        active: true,
      };

      if (!UtilController.isEmpty(req.session.organizationId))
        match["organizationId"] = mongoose.Types.ObjectId(req.session.organizationId);
      if (!UtilController.isEmpty(req.body.active)) match["active"] = req.body.active;

      if (userType !== "Admin") {
        match["$or"] = [
          { employeeId: mongoose.Types.ObjectId(userId) },
          { managerId: mongoose.Types.ObjectId(userId) },
          { managerId: { $in: [mongoose.Types.ObjectId(userId)] } },
        ];
      }
      if (!UtilController.isEmpty(req.body.employeeName))
        match["employeeName"] = mongoose.Types.ObjectId(req.body.employeeName);

      if (!UtilController.isEmpty(req.body.startDate) || !UtilController.isEmpty(req.body.endDate)) {
        if (!match["$and"]) match["$and"] = [];
        if (!UtilController.isEmpty(req.body.startDate))
          match["$and"].push({ startDate: { $gte: req.body.startDate } });
        if (!UtilController.isEmpty(req.body.endDate)) match["$and"].push({ endDate: { $lte: req.body.endDate } });
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

      const project = await LeaveRequest.aggregate([
        { $match: match },
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
            from: "leave_types",
            localField: "leaveTypeId",
            foreignField: "_id",
            as: "leave_type",
          },
        },
        {
          $unwind: {
            path: "$leave_type",
            preserveNullAndEmptyArrays: true,
          },
        },
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
            from: "users",
            localField: "employeeId",
            foreignField: "_id",
            as: "employeeDetails",
          },
        },
        {
          $unwind: {
            path: "$employeeDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        { $match: search },
        {
          $facet: {
            totalCount: [{ $count: "count" }],
            data: [
              { $sort: sort },
              { $skip: page * pageSize },
              { $limit: pageSize },
              {
                $project: {
                  _id: 1,
                  employeeName: 1,
                  employeeId: 1,
                  employeeCode: 1,
                  employeeProfileImage: "$employeeDetails.profileImage",
                  managerId: 1,
                  managerDetails: {
                    _id: 1,
                    fname: 1,
                    lname: 1,
                    email: 1,
                  },
                  leaveTypeId: 1,
                  leaveType: 1,
                  startDate: 1,
                  endDate: 1,
                  totalDays: 1,
                  totalBreakHours: 1,
                  breakDate: 1,
                  breakHours: 1,
                  breakreason: 1,
                  reason: 1,
                  status: 1,
                  rejectedReason: 1,
                  rejectedBy: 1, // optional
                  rejectedAt: 1, // optional
                  approvedBy: 1, // optional
                  approvedAt: 1,
                  createdAt: 1,
                  updatedAt: 1,
                  organization: "$organization.organizationName",
                  leave_type: "$leave_type.name",
                },
              },
            ],
          },
        },
      ]);

      const totalCount = project?.[0].totalCount?.[0] ? project[0].totalCount[0].count : 0;
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
};
