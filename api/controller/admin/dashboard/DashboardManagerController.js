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
  getDashboardCountManager: async (req, res, next) => {
    try {
      const { userId, userType, tag } = req.body;

      if (!userId || !userType) {
        return UtilController.sendError(req, res, next, "User ID and User Type are required");
      }

      const allowedUserTypes = ["Manager", "TLS"];
      if (!allowedUserTypes.map(type => type.toLowerCase()).includes(userType.toLowerCase())) {
        return UtilController.sendError(req, res, next, "Invalid User Type");
      }

      const user = await User.findOne({ _id: userId });
      if (!user) {
        return UtilController.sendError(req, res, next, "User not found");
      }

      // If tag is provided, return time graph data instead of counts
      if (tag) {
        const currentTime = Math.floor(Date.now() / 1000);

        let match = {
          managerId: mongoose.Types.ObjectId(userId),
          active: true,
          status: "completed",
        };

        let tMatch = {
          managerId: mongoose.Types.ObjectId(userId),
          status: "approved",
        };

        if (tag === "weekly") {
          // Calculate current week's date range (Sunday to Saturday)
          const now = new Date();
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - now.getDay()); // Go to Sunday
          startOfWeek.setHours(0, 0, 0, 0);

          const endOfWeek = new Date(startOfWeek);
          endOfWeek.setDate(startOfWeek.getDate() + 6); // Go to Saturday
          endOfWeek.setHours(23, 59, 59, 999);

          const startTimestamp = Math.floor(startOfWeek.getTime() / 1000);
          const endTimestamp = Math.floor(endOfWeek.getTime() / 1000);

          // Add date range filter to match objects
          match.createdAt = { $gte: startTimestamp, $lte: endTimestamp };
          tMatch.createdAt = { $gte: startTimestamp, $lte: endTimestamp };

          // Default days structure
          const dayMap = {
            1: "Sunday",
            2: "Monday",
            3: "Tuesday",
            4: "Wednesday",
            5: "Thursday",
            6: "Friday",
            7: "Saturday",
          };

          const defaultData = Object.entries(dayMap).map(([dayNumber, dayName]) => ({
            day: dayName,
            completedTaskCount: 0,
            totalDuration: 0,
          }));

          // 1. Aggregate completed tasks per day from WorkAllocations
          const taskAgg = await WorkAllocations.aggregate([
            {
              $match: match,
            },
            {
              $addFields: {
                createdDate: { $toDate: { $multiply: ["$createdAt", 1000] } },
              },
            },
            {
              $addFields: {
                dayNumber: { $dayOfWeek: "$createdDate" },
              },
            },
            {
              $group: {
                _id: "$dayNumber",
                completedTaskCount: { $sum: 1 },
              },
            },
          ]);

          // 2. Aggregate duration per day from TimeSheet
          const durationAgg = await TimeSheet.aggregate([
            {
              $match: tMatch,
            },
            {
              $addFields: {
                createdDate: { $toDate: { $multiply: ["$createdAt", 1000] } },
              },
            },
            {
              $addFields: {
                dayNumber: { $dayOfWeek: "$createdDate" },
              },
            },
            {
              $group: {
                _id: "$dayNumber",
                totalDuration: { $sum: "$durationRequired" },
              },
            },
          ]);

          // 3. Merge both datasets into the default day array
          taskAgg.forEach(item => {
            const index = parseInt(item._id, 10) - 1;
            if (defaultData[index]) {
              defaultData[index].completedTaskCount = item.completedTaskCount;
            }
          });

          durationAgg.forEach(item => {
            const index = parseInt(item._id, 10) - 1;
            if (defaultData[index]) {
              defaultData[index].totalDuration = Math.round((item.totalDuration || 0) / 60); // Convert to hours
            }
          });

          return UtilController.sendSuccess(req, res, next, defaultData);
        } else if (tag === "monthly") {
          // Calculate current year's date range (Jan 1 to Dec 31)
          const now = new Date();
          const startOfYear = new Date(now.getFullYear(), 0, 1); // January 1st
          startOfYear.setHours(0, 0, 0, 0);

          const endOfYear = new Date(now.getFullYear(), 11, 31); // December 31st
          endOfYear.setHours(23, 59, 59, 999);

          const startTimestamp = Math.floor(startOfYear.getTime() / 1000);
          const endTimestamp = Math.floor(endOfYear.getTime() / 1000);

          // Add date range filter to match objects
          match.createdAt = { $gte: startTimestamp, $lte: endTimestamp };
          tMatch.createdAt = { $gte: startTimestamp, $lte: endTimestamp };

          // Month number to name mapping
          const monthMap = {
            1: "January",
            2: "February",
            3: "March",
            4: "April",
            5: "May",
            6: "June",
            7: "July",
            8: "August",
            9: "September",
            10: "October",
            11: "November",
            12: "December",
          };

          // Create default result array (Jan to Dec)
          const defaultData = Object.entries(monthMap).map(([monthNumber, monthName]) => ({
            month: monthName,
            completedTaskCount: 0,
            totalDuration: 0,
          }));

          // 1. Aggregate task count from WorkAllocations
          const taskAgg = await WorkAllocations.aggregate([
            {
              $match: match,
            },
            {
              $addFields: {
                createdDate: { $toDate: { $multiply: ["$createdAt", 1000] } },
              },
            },
            {
              $addFields: {
                monthNumber: { $month: "$createdDate" },
              },
            },
            {
              $group: {
                _id: "$monthNumber",
                completedTaskCount: { $sum: 1 },
              },
            },
          ]);

          // 2. Aggregate duration from TimeSheet
          const durationAgg = await TimeSheet.aggregate([
            {
              $match: tMatch,
            },
            {
              $addFields: {
                createdDate: { $toDate: { $multiply: ["$createdAt", 1000] } },
              },
            },
            {
              $addFields: {
                monthNumber: { $month: "$createdDate" },
              },
            },
            {
              $group: {
                _id: "$monthNumber",
                totalDuration: { $sum: "$durationRequired" },
              },
            },
          ]);

          // 3. Merge results into default data
          taskAgg.forEach(item => {
            const index = item._id - 1;
            if (defaultData[index]) {
              defaultData[index].completedTaskCount = item.completedTaskCount;
            }
          });

          durationAgg.forEach(item => {
            const index = item._id - 1;
            if (defaultData[index]) {
              defaultData[index].totalDuration = Math.round((item.totalDuration || 0) / 60); // convert to hours
            }
          });

          return UtilController.sendSuccess(req, res, next, defaultData);
        } else {
          return UtilController.sendError(req, res, next, "Invalid tag. Use 'weekly' or 'monthly'");
        }
      }

      // If no tag is provided, return dashboard counts (original functionality)
      const currentTime = Math.floor(Date.now() / 1000);

      const [
        projectHeadCount,
        activeProjectCounts,
        overdueTaskCounts,
        pendingTimesheetCount,
        pendingLeaveRequestCount,
        pendingExpenseClaimCount,
      ] = await Promise.all([
        Projects.aggregate([
          {
            $match: {
              active: true,
            },
          },
          {
            $project: {
              projectHeadCount: { $size: "$projectHead" },
            },
          },
          {
            $group: {
              _id: null,
              teamsCount: { $sum: "$projectHeadCount" },
            },
          },
          {
            $project: {
              _id: 0,
              teamsCount: 1,
            },
          },
        ]),

        Projects.aggregate([
          {
            $match: {
              active: true,
              $or: [
                { projectHead: { $in: [mongoose.Types.ObjectId(userId)] } },
                { team: { $in: [mongoose.Types.ObjectId(userId)] } },
              ],
              projectStatus: { $nin: ["completed", "archived"] },
            },
          },
          { $count: "activeCount" },
        ]),

        WorkAllocations.aggregate([
          {
            $match: {
              managerId: { $in: [mongoose.Types.ObjectId(userId)] },
              active: true,
              endDateTime: { $lt: currentTime },
              status: { $nin: ["completed", "Completed"] },
            },
          },
          { $count: "overdueCount" },
        ]),

        TimeSheet.aggregate([
          {
            $match: {
              active: true,
              managerId: { $in: [mongoose.Types.ObjectId(userId)] },
              status: "pending",
            },
          },
          { $count: "pendingCount" },
        ]),

        LeaveRequest.aggregate([
          {
            $match: {
              active: true,
              managerId: { $in: [mongoose.Types.ObjectId(userId)] },
              status: "Pending",
            },
          },
          { $count: "pendingCount" },
        ]),

        ExpenseClaim.aggregate([
          {
            $match: {
              active: true,
              managerId: { $in: [mongoose.Types.ObjectId(userId)] },
              managerStatus: "Pending",
            },
          },
          { $count: "pendingCount" },
        ]),
      ]);

      const teamsCount = projectHeadCount.length > 0 ? projectHeadCount[0].teamsCount : 0;
      const activeCount = activeProjectCounts.length > 0 ? activeProjectCounts[0].activeCount : 0;
      const overdueCount = overdueTaskCounts.length > 0 ? overdueTaskCounts[0].overdueCount : 0;

      const timesheetPending = pendingTimesheetCount.length > 0 ? pendingTimesheetCount[0].pendingCount : 0;
      const leaveRequestPending = pendingLeaveRequestCount.length > 0 ? pendingLeaveRequestCount[0].pendingCount : 0;
      const expenseClaimPending = pendingExpenseClaimCount.length > 0 ? pendingExpenseClaimCount[0].pendingCount : 0;

      const totalPendingApprovals = timesheetPending + leaveRequestPending + expenseClaimPending;

      const responseData = [
        { title: "Total Team Members", value: teamsCount },
        { title: "Active Projects", value: activeCount },
        { title: "Pending Approvals", value: totalPendingApprovals },
        { title: "OverDue Tasks", value: overdueCount },
      ];

      UtilController.sendSuccess(req, res, next, responseData);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      UtilController.sendError(req, res, next, "An error occurred while fetching dashboard data");
    }
  },

  getDashboardDataManager: async (req, res, next) => {
    try {
      const { userId, userType } = req.session;

      if (!userId || !userType) {
        return UtilController.sendError(req, res, next, "User ID and User Type are required");
      }
      const allowedUserTypes = ["Manager", "TLS"];
      if (!allowedUserTypes.map(type => type.toLowerCase()).includes(userType?.toLowerCase())) {
        return UtilController.sendError(req, res, next, "Invalid User Type");
      }
      const user = await User.findById(userId);
      if (!user) {
        return UtilController.sendError(req, res, next, "User not found");
      }

      const results = await Promise.all([
        User.aggregate([
          { $match: { reportingManagerNameID: mongoose.Types.ObjectId(userId) } },
          {
            $group: {
              _id: "$reportingManagerNameID",
              employeeCount: { $sum: 1 },
            },
          },
        ]),

        TimeSheet.aggregate([
          { $match: { managerId: mongoose.Types.ObjectId(userId), status: "pending" } },
          { $group: { _id: "$managerId", pendingTaskCount: { $sum: 1 } } },
        ]),

        Projects.aggregate([
          { $match: { projectHead: mongoose.Types.ObjectId(userId), projectStatus: "completed", active: true } },
          { $group: { _id: "$projectHead", totalProjects: { $sum: 1 } } },
        ]),

        Projects.aggregate([
          {
            $match: {
              projectHead: mongoose.Types.ObjectId(userId),
              projectStatus: { $in: ["open", "allocated", "reopened"] },
              active: true,
            },
          },
          { $group: { _id: "$projectHead", totalProjectsON: { $sum: 1 } } },
        ]),
      ]);

      const [employeeCountResult, pendingApprovals, completedProjectsCount, ongoingProjectsCount] = results;
      const employeeData = employeeCountResult[0] || { employeeCount: 0 };
      const PendingApprovals = pendingApprovals[0] || { pendingTaskCount: 0 };
      const completedProjectData = completedProjectsCount[0] || { totalProjects: 0 };
      const ongoingProjectData = ongoingProjectsCount[0] || { totalProjectsON: 0 };
      const responseData = [
        { title: "Total Employees", value: employeeData.employeeCount },
        { title: "Pending Approvals", value: PendingApprovals.pendingTaskCount },
        { title: "Ongoing Projects", value: ongoingProjectData.totalProjectsON },
        { title: "Completed Projects", value: completedProjectData.totalProjects },
      ];
      UtilController.sendSuccess(req, res, next, responseData);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      UtilController.sendError(req, res, next, "An error occurred while fetching dashboard data");
    }
  },

};
