let request = require("request");
let mongoose = require("mongoose");
const Pos = require("../../models/Po");
const { parsePhoneNumberFromString } = require("libphonenumber-js");
const UtilController = require("../services/UtilController");
const Quote = require("../../models/Quote");
const LeaveRequest = require("../../models/LeaveRequest");
const returnCode = require("../../../config/responseCode").returnCode;

module.exports = {
  createExpense: async (req, res) => {
    try {
      const { employeeName, managerId, leaveTypeId, leaveType, startDate, endDate, totalDays, reason } = req.body;
      if (UtilController.isEmpty(req.session.organizationId)) throw { message: "Organization Id is required" };

      const newLeaveRequest = new LeaveRequest({
        organizationId: req.session.organizationId,
        employeeName,
        employeeId,
        managerId,
        leaveTypeId,
        leaveType,
        startDate,
        endDate,
        totalDays,
        reason,
        status: "Pending",
        createdBy: null,
      });

      const savedLeaveRequest = await newLeaveRequest.save();
      res.status(201).json({ message: "Leave Request created successfully", data: savedLeaveRequest });
    } catch (error) {
      res.status(500).json({ message: "Error creating PO", error: error.message });
    }
  },

  deleteExpense: async (req, res, next) => {
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
  getExpenseById: async (req, res, next) => {
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
        {
          $project: {
            _id: 1,
            employeeName: 1,
            managerId: 1,
            leaveTypeId: 1,
            leaveType: 1,
            startDate: 1,
            endDate: 1,
            totalDays: 1,
            reason: 1,
            createdAt: 1,
            updatedAt: 1,
            organization: 1,

            organization: {
              name: "$organization.organizationName",
              _id: "$organization._id",
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

  updateExpense: async (req, res, next) => {
    try {
      const updateObj = req.body;

      // Check if poId is provided in the request body
      if (!updateObj.leaveRequestId) {
        UtilController.sendError(req, res, next, {
          responseCode: returnCode.incompleteBody,
          message: "leaveRequestId is required.",
        });
        return;
      }

      // Add fields for operation tracking
      updateObj["operatedBy"] = req.session.userId;
      updateObj["updatedAt"] = Math.floor(Date.now() / 1000);

      // Find the po by poId and update it
      const leaveRequest = await LeaveRequest.findByIdAndUpdate(updateObj.leaveRequestId, updateObj, { new: true });

      // If the po is not found, send a 'not found' response
      if (!leaveRequest) {
        UtilController.sendError(req, res, next, {
          responseCode: returnCode.recordNotFound,
          message: "leaveRequest not found or update failed.",
        });
        return;
      }

      // Send success response with updated po data
      UtilController.sendSuccess(req, res, next, {
        message: "leaveRequest updated successfully.",
        leaveRequest,
        responseCode: returnCode.validSession,
      });
    } catch (error) {
      console.error("Error updating leaveRequest:", error);
      UtilController.sendError(req, res, next, {
        message: "An error occurred while updating the leaveRequest.",
        error: error.message,
        responseCode: returnCode.errror,
      });
    }
  },
  listExpense: async (req, res, next) => {
    try {
      //apply sort, search, pagination
      let search = {};
      let userId = req.session.userId;
      let userType = req.session.userType;
      if (!UtilController.isEmpty(req.body.keyword)) {
        search["$or"] = [
          // { "scuId.title": { $regex: req.body.keyword, $options: "i" } },
          { employeeName: { $regex: req.body.keyword, $options: "i" } },
          
        ];
      }

      let match = {
        active: true,
      };
      if (!UtilController.isEmpty(req.session.organizationId))
        match["organizationId"] = mongoose.Types.ObjectId(req.session.organizationId);
      if (!UtilController.isEmpty(req.body.active)) match["active"] = req.body.active;

      if (!UtilController.isEmpty(req.body.employeeName))
        match["employeeName"] = mongoose.Types.ObjectId(req.body.employeeName);

      if (!UtilController.isEmpty(req.body.startDate) || !UtilController.isEmpty(req.body.endDate)) {
        match["$and"] = [];
        if (!UtilController.isEmpty(req.body.startDate)) match["$and"].push({ startDate: { $gte: req.body.startDate } });

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

        { $match: search },
        {
          $facet: {
            totalCount: [{ $count: "count" }],
            data: [{ $sort: sort }, { $skip: page * pageSize }, { $limit: pageSize }],
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
