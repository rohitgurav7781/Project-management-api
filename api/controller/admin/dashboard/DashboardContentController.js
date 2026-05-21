const WorkAllocations = require("../../../models/WorkAllocations");
const Feedback = require("../../../models/FeedBack");
const responseCode = require("../../../../config/responseCode");
const returnCode = require("../../../../config/responseCode").returnCode;
const TimeSheet = require("../../../models/Timesheet");
const LeaveRequest = require("../../../models/LeaveRequest");
const ExpenseClaim = require("../../../models/ExpenseClaim");
const User = require("../../../models/User");
const Projects = require("../../../models/Project");
const Customer = require("../../../models/Customer");
const {
  getDateRange,
  getDateRangeForQuery,
  createMatchCondition,
  generateGroupStage,
} = require("../../services/UtilController");
const UtilController = require("../../services/UtilController");
const mongoose = require("mongoose");
const Policy = require("../../../models/Policy");
const Event = require("../../../models/Event");
const Teams = require("../../../models/Teams");

module.exports = {
  eventList: async (req, res, next) => {
    try {
      // const { userId, userType } = req.body;

      // if (!userId || !userType) {
      //   return UtilController.sendError(req, res, next, "User ID and User Type are required");
      // }
      // const allowedUserTypes = ["Employee"];
      // if (!allowedUserTypes.includes(userType)) {
      //   return UtilController.sendError(req, res, next, "Invalid User Type");
      // }

      // const user = await User.findOne({ _id: userId });
      // if (!user) {
      //   return UtilController.sendError(req, res, next, "User not found");
      // }
     
      let organizationId = req.body.organizationId || req.session.organizationId;
      let match = { active: true};
      if (!UtilController.isEmpty(organizationId)) {
        match["organizationId"] = mongoose.Types.ObjectId(organizationId);
      }

      // if (!UtilController.isEmpty(req.body.projectId)) match["projectId"] = mongoose.Types.ObjectId(req.body.projectId);

      // if (!UtilController.isEmpty(req.body.userId)) match["employeeId"] = mongoose.Types.ObjectId(userId);

      // if (!UtilController.isEmpty(req.body.startDate) || !UtilController.isEmpty(req.body.endDate)) {
      //   match["$and"] = [];
      //   if (!UtilController.isEmpty(req.body.startDate))
      //     match["$and"].push({ createdAt: { $gte: req.body.startDate } });

      //   if (!UtilController.isEmpty(req.body.endDate)) match["$and"].push({ createdAt: { $lte: req.body.endDate } });
      // }

      const eventList = await Event.aggregate([{ $match: match }]);

      UtilController.sendSuccess(req, res, next, eventList);
    } catch (error) {
      console.error("Error fetching eventList :", error);
      UtilController.sendError(req, res, next, "An error occurred while fetching eventList");
    }
  },

  policyList: async (req, res, next) => {
    try {
      // const { userId, userType } = req.body;

      // if (!userId || !userType) {
      //   return UtilController.sendError(req, res, next, "User ID and User Type are required");
      // }
      // const allowedUserTypes = ["Employee"];
      // if (!allowedUserTypes.includes(userType)) {
      //   return UtilController.sendError(req, res, next, "Invalid User Type");
      // }

      // const user = await User.findOne({ _id: userId });
      // if (!user) {
      //   return UtilController.sendError(req, res, next, "User not found");
      // }
      let organizationId = req.body.organizationId || req.session.organizationId;
      let match = { active: true};
      if (!UtilController.isEmpty(organizationId)) {
        match["organizationId"] = mongoose.Types.ObjectId(organizationId);
      }
      // if (!UtilController.isEmpty(req.body.projectId)) match["projectId"] = mongoose.Types.ObjectId(req.body.projectId);

      // if (!UtilController.isEmpty(req.body.userId)) match["employeeId"] = mongoose.Types.ObjectId(userId);

      // if (!UtilController.isEmpty(req.body.startDate) || !UtilController.isEmpty(req.body.endDate)) {
      //   match["$and"] = [];
      //   if (!UtilController.isEmpty(req.body.startDate))
      //     match["$and"].push({ createdAt: { $gte: req.body.startDate } });

      //   if (!UtilController.isEmpty(req.body.endDate)) match["$and"].push({ createdAt: { $lte: req.body.endDate } });
      // }

      const policyList = await Policy.aggregate([{ $match: match }]);

      UtilController.sendSuccess(req, res, next, policyList);
    } catch (error) {
      console.error("Error fetching policy List :", error);
      UtilController.sendError(req, res, next, "An error occurred while fetching policy List");
    }
  },

};
