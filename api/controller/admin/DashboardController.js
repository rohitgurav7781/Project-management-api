const WorkAllocations = require("../../models/WorkAllocations");
const Feedback = require("../../models/FeedBack");
const responseCode = require("../../../config/responseCode");
const returnCode = require("../../../config/responseCode").returnCode;
const TimeSheet = require("../../models/Timesheet");
const LeaveRequest = require("../../models/LeaveRequest");
const ExpenseClaim = require("../../models/ExpenseClaim");
const User = require("../../models/User");
const Projects = require("../../models/Project");
const Customer = require("../../models/Customer");
const {
  getDateRange,
  getDateRangeForQuery,
  createMatchCondition,
  generateGroupStage,
} = require("../services/UtilController");
const UtilController = require("../services/UtilController");
const mongoose = require("mongoose");
const Policy = require("../../models/Policy");
const Event = require("../../models/Event");
const Teams = require("../../models/Teams");
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
  getAdminDashboardCount: async (req, res, next) => {
    try {
      const { userId, userType } = req.body;
      let organizationId = req.body.organizationId || req.session.organizationId;

      if (!userId || !userType) {
        return UtilController.sendError(req, res, next, "User ID and User Type are required");
      }
      const allowedUserTypes = ["admin", "organizationadmin"];
      if (!allowedUserTypes.includes(userType)) {
        return UtilController.sendError(req, res, next, "Invalid User Type");
      }

      const user = await User.findOne({ _id: userId });
      if (!user) {
        return UtilController.sendError(req, res, next, "User not found");
      }

      let match = { active: true };
      if (!UtilController.isEmpty(organizationId)) {
        match["organizationId"] = mongoose.Types.ObjectId(organizationId);
      }

      const [employeeCounts, ongoingProjectCounts, completedProjectCounts] = await Promise.all([
        User.aggregate([
          {
            $match: {
              ...match,
            },
          },
          {
            $group: {
              _id: null, // Combine all user types
              employeeCount: { $sum: 1 }, // Count total employees (Manager, Manger, Employee)
            },
          },
          {
            $project: {
              _id: 0,
              employeeCount: 1, // Output only the employee count
            },
          },
        ]),

        Projects.aggregate([
          {
            $match: {
              ...match,
            },
          },
          { $count: "ongoingCount" },
        ]),

        Projects.aggregate([
          {
            $match: {
              ...match,
              projectStatus: "on_hold",
            },
          },
          { $count: "pendingCount" },
        ]),
      ]);

      const employeeCount = employeeCounts.length > 0 ? employeeCounts[0].employeeCount : 0;
      // const customerCount = customerCounts.length > 0 ? customerCounts[0].customerCount : 0;
      const ongoingCount = ongoingProjectCounts.length > 0 ? ongoingProjectCounts[0].ongoingCount : 0;
      const pendingCount = completedProjectCounts.length > 0 ? completedProjectCounts[0].pendingCount : 0;

      const responseData = [
        { title: "Total Users", value: employeeCount },
        { title: "Active Projects", value: ongoingCount },
        { title: "Pending Approval", value: pendingCount },
        { title: "System Health", value: 99.9 },
        { title: "Resource Utilisation", value: 85.9 },
      ];

      UtilController.sendSuccess(req, res, next, responseData);
      console.log("admin response data", responseData);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      UtilController.sendError(req, res, next, "An error occurred while fetching dashboard data");
    }
  },
  projectStatusDistribution: async (req, res, next) => {
    try {
      const { userId, userType, day } = req.body;
      let organizationId = req.body.organizationId || req.session.organizationId;
      let match = {};
      if (!UtilController.isEmpty(organizationId)) {
        match["organizationId"] = mongoose.Types.ObjectId(organizationId);
      }
      if (!userId || !userType) {
        return UtilController.sendError(req, res, next, "User ID and User Type are required");
      }
      const allowedUserTypes = ["Organization Admin", "Admin", "Manager", "TLS"];
      if (!allowedUserTypes.map(type => type.toLowerCase()).includes(userType?.toLowerCase())) {
        return UtilController.sendError(req, res, next, "Invalid User Type");
      }

      const user = await User.findOne({ _id: userId });
      if (!user) {
        return UtilController.sendError(req, res, next, "User not found");
      }

      const now = Math.floor(Date.now() / 1000); // current time in seconds
      const DaysAgo = now - day * 24 * 60 * 60; // 30 days ago in seconds

      const aggregation = await Projects.aggregate([
        {
          $match: {
            ...match,
            updatedAt: { $gte: DaysAgo },
          },
        },
        {
          $group: {
            _id: "$projectStatus",
            count: { $sum: 1 },
          },
        },
      ]);

      const total = aggregation.reduce((sum, item) => sum + item.count, 0);

      // Include all 4 statuses even if 0
      const allStatuses = ["completed", "open", "on_hold", "archived"];

      const statusMap = {};
      aggregation.forEach(item => {
        statusMap[item._id] = item.count;
      });

      const result = allStatuses.map(status => ({
        label: status,
        value: total ? Math.round(((statusMap[status] || 0) / total) * 100) : 0,
      }));

      res.json({
        timeFrame: `Last ${day} Days`,
        statusDistribution: result,
      });
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      UtilController.sendError(req, res, next, "An error occurred while fetching dashboard data");
    }
  },

  getAdminTimesheetGraph: async (req, res, next) => {
    try {
      const { userId, userType, tag } = req.body;

      let organizationId = req.body.organizationId || req.session.organizationId;
      let match = {};
      if (!UtilController.isEmpty(organizationId)) {
        match["organizationId"] = mongoose.Types.ObjectId(organizationId);
      }

      if (!userId || !userType) {
        return UtilController.sendError(req, res, next, "User ID and User Type are required");
      }
      const allowedUserTypes = ["Admin", "Organization Admin"];
      if (!allowedUserTypes.includes(userType)) {
        return UtilController.sendError(req, res, next, "Invalid User Type");
      }

      const user = await User.findOne({ _id: userId });
      if (!user) {
        return UtilController.sendError(req, res, next, "User not found");
      }
      const currentTime = Math.floor(Date.now() / 1000);

      if (tag == "weekly") {
        // Default days structure
        const dayMap = {
          1: "Sunday",
          2: "Monday",
          3: "Tuesday",
          4: "Wednesday",
          5: "Thirsday", // intentional spelling as per your sample
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
            $match: {
                ...match,
              employeeId: mongoose.Types.ObjectId(userId),
              active: true,
              status: "Completed",
            },
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
            $match: {
                ...match,
              employeeId: mongoose.Types.ObjectId(userId),
              status: "approved",
            },
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
        UtilController.sendSuccess(req, res, next, defaultData);
      } else if (tag == "monthly") {
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
            $match: {
                ...match,
              employeeId: mongoose.Types.ObjectId(userId),
              active: true,
              status: "Completed",
            },
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
            $match: {
                ...match,
              employeeId: mongoose.Types.ObjectId(userId),
              status: "approved",
            },
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
        UtilController.sendSuccess(req, res, next, defaultData);
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      UtilController.sendError(req, res, next, "An error occurred while fetching dashboard data");
    }
  },

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

  getDashboardCountEmployee: async (req, res, next) => {
    console.log("getDashboardCountEmployee");
    try {
      const { userId, userType } = req.body;

      if (!userId || !userType) {
        return UtilController.sendError(req, res, next, "User ID and User Type are required");
      }
      const allowedUserTypes = ["Employee"];
      if (!allowedUserTypes.includes(userType)) {
        return UtilController.sendError(req, res, next, "Invalid User Type");
      }

      const user = await User.findOne({ _id: userId });
      if (!user) {
        return UtilController.sendError(req, res, next, "User not found");
      }
      const currentTime = Math.floor(Date.now() / 1000);
      // Single pipeline to get feedback counts
      const feedbackCounts = await Feedback.aggregate([
        {
          $match: {
            employeeId: mongoose.Types.ObjectId(userId),
            //active: true,
          },
        },
        {
          $group: {
            _id: "$feedbackType",
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            ratingCount: { $cond: [{ $eq: ["$_id", "rating"] }, "$count", 0] },
            appreciationCount: { $cond: [{ $eq: ["$_id", "appreciation"] }, "$count", 0] },
          },
        },
        {
          $group: {
            _id: null,
            ratingCount: { $sum: "$ratingCount" },
            appreciationCount: { $sum: "$appreciationCount" },
          },
        },
      ]);

      const feedbackData = feedbackCounts[0] || { ratingCount: 0, appreciationCount: 0 };

      const taskCounts = await WorkAllocations.aggregate([
        {
          $match: {
            employeeId: mongoose.Types.ObjectId(userId),
            active: true,
          },
        },
        {
          $group: {
            _id: {
              taskStatus: "$status",
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
            missedDueDatesCount: 1,
          },
        },
      ]);

      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const result = await TimeSheet.aggregate([
        {
          $match: {
            employeeId: mongoose.Types.ObjectId(userId),
            status: "approved",
            //createdAt: { $gte: oneWeekAgo }, // assuming 'createdAt' is your timestamp field
          },
        },
        {
          $group: {
            _id: null,
            totalDuration: { $sum: "$durationRequired" }, // assuming 'duration' is in minutes, hours, etc.
          },
        },
      ]);

      const totalDuration = result[0]?.totalDuration / 60 || 0;

      const taskData = taskCounts[0] || { completedTaskCount: 0, missedDueDatesCount: 0 };
      //       console.log("taskData", taskData)
      // console.log("feedbackData", feedbackData)
      // console.log("totalDuration", totalDuration)

      const responseData = [
        { title: "Total Ratings", value: feedbackData.ratingCount },
        // { title: "Total Appreciations", value: feedbackData.appreciationCount },
        { title: "Completed Task", value: taskData.completedTaskCount },
        { title: "In Progress Task", value: taskData.completedTaskCount },
        { title: "Assigned Task", value: taskData.completedTaskCount },
        { title: "Over Due Task", value: taskData.missedDueDatesCount },
        { title: "Hours Logged(Week)", value: totalDuration },
      ];
      UtilController.sendSuccess(req, res, next, responseData);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      UtilController.sendError(req, res, next, "An error occurred while fetching dashboard data");
    }
  },
  getTimesheetGraph: async (req, res, next) => {
    try {
      const { userId, userType, tag } = req.body;

      if (!userId || !userType) {
        return UtilController.sendError(req, res, next, "User ID and User Type are required");
      }
      const allowedUserTypes = ["Employee", "Manager", "TLS"];
      if (!allowedUserTypes.map(type => type.toLowerCase()).includes(userType?.toLowerCase())) {
        return UtilController.sendError(req, res, next, "Invalid User Type");
      }

      const user = await User.findOne({ _id: userId });
      if (!user) {
        return UtilController.sendError(req, res, next, "User not found");
      }
      const currentTime = Math.floor(Date.now() / 1000);

      let match = {
        employeeId: mongoose.Types.ObjectId(userId),
        active: true,
        status: "Completed",
      };

      if (userType == "Manager") {
        match = {
          managerId: mongoose.Types.ObjectId(userId),
          active: true,
          status: "Completed",
        };
      }

      let tMatch = {
        employeeId: mongoose.Types.ObjectId(userId),
        status: "approved",
      };
      if (userType == "Manager") {
        tMatch = {
          managerId: mongoose.Types.ObjectId(userId),
          status: "approved",
        };
      }

      if (tag == "weekly") {
        // Default days structure
        const dayMap = {
          1: "Sunday",
          2: "Monday",
          3: "Tuesday",
          4: "Wednesday",
          5: "Thirsday", // intentional spelling as per your sample
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
        UtilController.sendSuccess(req, res, next, defaultData);
      } else if (tag == "monthly") {
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
        UtilController.sendSuccess(req, res, next, defaultData);
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      UtilController.sendError(req, res, next, "An error occurred while fetching dashboard data");
    }
  },

  assingnedTaskList: async (req, res, next) => {
    try {
      const { userId, userType } = req.body;

      if (!userId || !userType) {
        return UtilController.sendError(req, res, next, "User ID and User Type are required");
      }

      const allowedUserTypes = ["Employee"];
      if (!allowedUserTypes.includes(userType)) {
        return UtilController.sendError(req, res, next, "Invalid User Type");
      }

      const user = await User.findOne({ _id: userId });
      if (!user) {
        return UtilController.sendError(req, res, next, "User not found");
      }

      let match = {
        active: true,
      };

      if (!UtilController.isEmpty(req.body.projectId)) match["projectId"] = mongoose.Types.ObjectId(req.body.projectId);

      if (!UtilController.isEmpty(req.body.userId)) match["employeeId"] = mongoose.Types.ObjectId(userId);

      if (!UtilController.isEmpty(req.body.startDate) || !UtilController.isEmpty(req.body.endDate)) {
        match["$and"] = [];
        if (!UtilController.isEmpty(req.body.startDate))
          match["$and"].push({ createdAt: { $gte: req.body.startDate } });

        if (!UtilController.isEmpty(req.body.endDate)) match["$and"].push({ createdAt: { $lte: req.body.endDate } });
      }

      const assignedTasks = await WorkAllocations.aggregate([
        { $match: match },

        {
          $addFields: {
            computedStatus: {
              $cond: {
                if: {
                  $or: [{ $eq: ["$status", "completed"] }, { $eq: ["$status", "approved"] }],
                },
                then: "$status",
                else: {
                  $cond: {
                    if: {
                      $and: [{ $lt: ["$endDateTime", Math.floor(Date.now() / 1000)] }, { $eq: ["$status", "pending"] }],
                    },
                    then: "overdue",
                    else: "$status",
                  },
                },
              },
            },
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
            path: "$projects",
            preserveNullAndEmptyArrays: true,
          },
        },

        {
          $project: {
            _id: 1,
            employeeId: 1,
            tagId: 1,
            organizationId: 1,
            projectId: 1,
            domains: 1,
            domainNames: 1,
            taskName: 1,
            active: 1,
            activity: 1,
            subActivityId: 1,
            subActivityName: 1,
            attachment: 1,
            activityName: 1,
            managerId: 1,
            quantity: 1,
            startDateTime: 1,
            endDateTime: 1,
            workDescription: 1,
            status: "$computedStatus",
            taskStatus: 1,
            taskType: 1,
            rejectionReason: 1,
            priority: 1,
            duration: 1,
            breakHour: 1,
            durationRequired: 1,
            submittedAt: 1,
            updatedAt: 1,
            createdAt: 1,
            operatedBy: 1,
            createdBy: 1,
            updatedBy: 1,
            timesheetRefIds: 1,
            notifications: 1,
            project: 1, // Include populated project data
          },
        },
      ]);

      UtilController.sendSuccess(req, res, next, assignedTasks);
    } catch (error) {
      console.error("Error fetching tasks :", error);
      UtilController.sendError(req, res, next, "An error occurred while fetching tasks");
    }
  },

  overDueTaskList: async (req, res, next) => {
    try {
      const { userId, userType } = req.body;

      if (!userId || !userType) {
        return UtilController.sendError(req, res, next, "User ID and User Type are required");
      }
      const allowedUserTypes = ["Employee"];
      if (!allowedUserTypes.includes(userType)) {
        return UtilController.sendError(req, res, next, "Invalid User Type");
      }

      const user = await User.findOne({ _id: userId });
      if (!user) {
        return UtilController.sendError(req, res, next, "User not found");
      }

      const currentTime = Math.floor(Date.now() / 1000);

      const overDueTasks = await WorkAllocations.aggregate([
        {
          $match: {
            $and: [
              { employeeId: mongoose.Types.ObjectId(userId) },
              { active: true },
              { status: { $ne: "Completed" } },
              { endDateTime: { $lt: currentTime } },
            ],
          },
        },
      ]);

      UtilController.sendSuccess(req, res, next, overDueTasks);
    } catch (error) {
      console.error("Error fetching tasks :", error);
      UtilController.sendError(req, res, next, "An error occurred while fetching tasks");
    }
  },

  feedbackList: async (req, res, next) => {
    try {
      const { userId, userType } = req.body;

      if (!userId || !userType) {
        return UtilController.sendError(req, res, next, "User ID and User Type are required");
      }

      const allowedUserTypes = ["Employee"];
      if (!allowedUserTypes.includes(userType)) {
        return UtilController.sendError(req, res, next, "Invalid User Type");
      }

      const user = await User.findOne({ _id: userId });
      if (!user) {
        return UtilController.sendError(req, res, next, "User not found");
      }

      const feedbacks = await Feedback.aggregate([
        {
          $match: {
            employeeId: mongoose.Types.ObjectId(userId),
            active: true,
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
          $unwind: {
            path: "$managerDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $addFields: {
            managerName: {
              $concat: [{ $ifNull: ["$managerDetails.fname", ""] }, " ", { $ifNull: ["$managerDetails.lname", ""] }],
            },
            managerPosition: { $ifNull: ["$managerDetails.position", ""] },
            ratingOutOf5: {
              $cond: {
                if: { $lte: ["$averageRating", 5] },
                then: { $round: ["$averageRating", 1] },
                else: { $round: [{ $divide: [{ $multiply: ["$averageRating", 5] }, 100] }, 1] },
              },
            },
          },
        },
        {
          $project: {
            managerDetails: 0,
            averageRating: 0,
          },
        },
        {
          $facet: {
            feedbacks: [{ $match: {} }],
            averageRating: [
              {
                $group: {
                  _id: null,
                  avgRating: { $avg: "$ratingOutOf5" },
                  totalFeedbacks: { $sum: 1 },
                },
              },
              {
                $project: {
                  _id: 0,
                  averageOutOf5: { $round: ["$avgRating", 1] },
                  totalFeedbacks: 1,
                },
              },
            ],
          },
        },
      ]);

      const result = {
        feedbacks: feedbacks[0].feedbacks || [],
        averageRating: feedbacks[0].averageRating[0]?.averageOutOf5 || 0,
        totalFeedbacks: feedbacks[0].averageRating[0]?.totalFeedbacks || 0,
      };

      UtilController.sendSuccess(req, res, next, result);
    } catch (error) {
      console.error("Error fetching feedbacks:", error);
      UtilController.sendError(req, res, next, "An error occurred while fetching feedbacks");
    }
  },

  getDashboardEmployee: async (req, res, next) => {
    try {
      const { userId, userType, tag } = req.body;

      if (!userId || !userType) {
        return UtilController.sendError(req, res, next, "User ID and User Type are required");
      }
      const allowedUserTypes = ["Employee"];
      if (!allowedUserTypes.includes(userType)) {
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
          employeeId: mongoose.Types.ObjectId(userId),
          active: true,
          status: "completed",
        };

        let tMatch = {
          employeeId: mongoose.Types.ObjectId(userId),
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

      // Single pipeline to get feedback counts
      const feedbackCounts = await Feedback.aggregate([
        {
          $match: {
            employeeId: mongoose.Types.ObjectId(userId),
            active: true,
          },
        },
        {
          $group: {
            _id: "$feedbackType",
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            ratingCount: { $cond: [{ $eq: ["$_id", "rating"] }, "$count", 0] },
            appreciationCount: { $cond: [{ $eq: ["$_id", "appreciation"] }, "$count", 0] },
          },
        },
        {
          $group: {
            _id: null,
            ratingCount: { $sum: "$ratingCount" },
            appreciationCount: { $sum: "$appreciationCount" },
          },
        },
      ]);

      const feedbackData = feedbackCounts[0] || { ratingCount: 0, appreciationCount: 0 };

      const taskCounts = await WorkAllocations.aggregate([
        {
          $match: {
            employeeId: mongoose.Types.ObjectId(userId),
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
            missedDueDatesCount: 1,
          },
        },
      ]);

      const taskData = taskCounts[0] || { completedTaskCount: 0, missedDueDatesCount: 0 };

      const responseData = [
        { title: "Total Ratings", value: feedbackData.ratingCount },
        { title: "Total Appreciations", value: feedbackData.appreciationCount },
        { title: "Completed Task", value: taskData.completedTaskCount },
        { title: "Task Missed Due Dates", value: taskData.missedDueDatesCount },
      ];
      UtilController.sendSuccess(req, res, next, responseData);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      UtilController.sendError(req, res, next, "An error occurred while fetching dashboard data");
    }
  },

  getDashboardCountEmployee: async (req, res, next) => {
    try {
      const { userId, userType } = req.session;

      if (!userId || !userType) {
        return UtilController.sendError(req, res, next, "User ID and User Type are required");
      }
      const allowedUserTypes = ["Employee"];
      if (!allowedUserTypes.includes(userType)) {
        return UtilController.sendError(req, res, next, "Invalid User Type");
      }

      const user = await User.findOne({ _id: userId });
      if (!user) {
        return UtilController.sendError(req, res, next, "User not found");
      }
      const currentTime = Math.floor(Date.now() / 1000);
      // Single pipeline to get feedback counts
      const feedbackCounts = await Feedback.aggregate([
        {
          $match: {
            employeeId: mongoose.Types.ObjectId(userId),
            active: true,
          },
        },
        {
          $group: {
            _id: "$feedbackType",
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            ratingCount: { $cond: [{ $eq: ["$_id", "rating"] }, "$count", 0] },
            appreciationCount: { $cond: [{ $eq: ["$_id", "appreciation"] }, "$count", 0] },
          },
        },
        {
          $group: {
            _id: null,
            ratingCount: { $sum: "$ratingCount" },
            appreciationCount: { $sum: "$appreciationCount" },
          },
        },
      ]);

      const feedbackData = feedbackCounts[0] || { ratingCount: 0, appreciationCount: 0 };

      const taskCounts = await WorkAllocations.aggregate([
        {
          $match: {
            employeeId: mongoose.Types.ObjectId(userId),
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
            missedDueDatesCount: 1,
          },
        },
      ]);

      const taskData = taskCounts[0] || { completedTaskCount: 0, missedDueDatesCount: 0 };

      const responseData = [
        { title: "Total Ratings", value: feedbackData.ratingCount },
        { title: "Total Appreciations", value: feedbackData.appreciationCount },
        { title: "Completed Task", value: taskData.completedTaskCount },
        { title: "In Progress Task", value: taskData.completedTaskCount },
        { title: "Assigned Task", value: taskData.completedTaskCount },
        { title: "Over Due Task", value: taskData.missedDueDatesCount },
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

  getDashboardDataOrganization: async (req, res, next) => {
    try {
      const { userId, userType } = req.body;

      if (!userId || !userType) {
        return UtilController.sendError(req, res, next, "User ID and User Type are required");
      }
      // const allowedUserTypes = ["organization admin"];
      // if (!allowedUserTypes.includes(userType)) {
      //   return UtilController.sendError(req, res, next, "Invalid User Type");
      // }

      // const user = await User.findById(userId);
      // if (!user) {
      //   return UtilController.sendError(req, res, next, "User not found");
      // }

      const matchOrganization = {
        organizationId: mongoose.Types.ObjectId(userId),
        active: true,
      };

      const matchOrganizationemp = {
        organizationId: mongoose.Types.ObjectId(userId),
        active: true, // Replace with the organization ID
        userType: { $in: ["Manager", "manager", "Employee", "employee"] }, // Filter specific user types
      };

      const [employeeCounts, customerCounts, ongoingProjectCounts, completedProjectCounts] = await Promise.all([
        User.aggregate([
          { $match: matchOrganizationemp },
          { $unwind: "$employeeId" }, // Step 2: Unwind the employeeId array
          {
            $group: {
              _id: null, // Combine all user types
              employeeCount: { $sum: 1 }, // Count total employees (Manager, Manger, Employee)
            },
          },
          {
            $project: {
              _id: 0,
              employeeCount: 1, // Output only the employee count
            },
          },
        ]),

        Customer.aggregate([{ $match: matchOrganization }, { $count: "customerCount" }]),

        Projects.aggregate([
          {
            $match: {
              ...matchOrganization,
              projectStatus: { $in: ["open", "allocated", "reopened"] },
            },
          },
          { $count: "ongoingCount" },
        ]),

        Projects.aggregate([
          {
            $match: {
              ...matchOrganization,
              projectStatus: "completed",
            },
          },
          { $count: "completedCount" },
        ]),
      ]);

      const employeeCount = employeeCounts.length > 0 ? employeeCounts[0].employeeCount : 0;
      const customerCount = customerCounts.length > 0 ? customerCounts[0].customerCount : 0;
      const ongoingCount = ongoingProjectCounts.length > 0 ? ongoingProjectCounts[0].ongoingCount : 0;
      const completedCount = completedProjectCounts.length > 0 ? completedProjectCounts[0].completedCount : 0;

      const responseData = [
        { title: "Total Employees", value: employeeCount },
        { title: "Total Customers", value: customerCount },
        { title: "Ongoing Projects", value: ongoingCount },
        { title: "Completed Projects", value: completedCount },
      ];

      UtilController.sendSuccess(req, res, next, responseData);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      UtilController.sendError(req, res, next, "An error occurred while fetching dashboard data");
    }
  },

  getGraphData: async (req, res, next) => {
    try {
      const { dateType, option, startDate, endDate, userId, feedbackType } = req.body;
      let { userType } = req.body;

      userType = userType && userType.toLowerCase().trim();

      const startTimestamp = parseInt(startDate);
      const endTimestamp = parseInt(endDate);

      if (!dateType && (isNaN(startTimestamp) || isNaN(endTimestamp))) {
        throw new Error("Either dateType or valid startDate and endDate timestamps are required.");
      }

      // Helper function to determine grouping logic based on `datetype`
      const getGroupData = (dateType, additionalGroup = {}) => {
        const dateField = { $toDate: { $multiply: ["$createdAt", 1000] } };

        if (!dateType) {
          // Default grouping by year and month if dateType is missing
          return {
            _id: {
              day: { $dayOfMonth: dateField },
              week: { $week: dateField },
              year: { $year: dateField },
              month: { $month: dateField },
              ...additionalGroup,
            },
            count: { $sum: 1 },
          };
        }

        switch (dateType) {
          case "day":
            return {
              _id: {
                day: { $dayOfMonth: dateField },
                week: { $week: dateField },
                month: { $month: dateField },
                year: { $year: dateField },
                ...additionalGroup,
              },
              count: { $sum: 1 },
            };
          case "week":
            return {
              _id: {
                week: { $week: dateField },
                month: { $month: dateField },
                year: { $year: dateField },
                ...additionalGroup,
              },
              count: { $sum: 1 },
            };
          case "month":
            return {
              _id: {
                month: { $month: dateField },
                year: { $year: dateField },
                ...additionalGroup,
              },
              count: { $sum: 1 },
            };
          case "year":
            return {
              _id: {
                year: { $year: dateField },
                ...additionalGroup,
              },
              count: { $sum: 1 },
            };
          default:
            throw new Error("Invalid dateType. Allowed values are 'day', 'week', 'month', or 'year'.");
        }
      };

      // Aggregation pipelines for different module types
      const getWorkAllocationsPipeline = () => [
        {
          $match: {
            ...(startTimestamp && endTimestamp && { createdAt: { $gte: startTimestamp, $lte: endTimestamp } }),
            employeeId: mongoose.Types.ObjectId(userId), // Match by employeeId
            active: true, // Only active work allocations
          },
        },
        {
          $group: getGroupData(dateType, { taskStatus: "$taskStatus" }), // Group by taskStatus and date type
        },
        {
          $sort: {
            "_id.year": 1, // Sort by year
            "_id.month": 1, // Sort by month
            "_id.week": 1, // Sort by week
            "_id.day": 1, // Sort by day
          },
        },
        {
          $project: {
            _id: 0, // Exclude _id from the result
            year: "$_id.year", // Include year
            month: "$_id.month", // Include month
            week: "$_id.week", // Include week
            day: "$_id.day", // Include day
            taskStatus: "$_id.taskStatus", // Include taskStatus
            count: 1, // Include count of work allocations for each taskStatus
          },
        },
      ];

      const getFeedbackPipeline = () => [
        {
          $match: {
            employeeId: mongoose.Types.ObjectId(userId), // Match by employeeId
            active: true, // Only active feedback
            feedbackType: "rating", // Match only "rating" feedback
            ...(startTimestamp && endTimestamp && { createdAt: { $gte: startTimestamp, $lte: endTimestamp } }),
          },
        },
        {
          $group: getGroupData(dateType), // Group by dateType (day, week, month, year)
        },
        {
          $sort: {
            "_id.year": 1, // Sort by year in ascending order
            "_id.month": 1, // Sort by month in ascending order
            "_id.week": 1, // Sort by week in ascending order
            "_id.day": 1, // Sort by day in ascending order
          },
        },
        {
          $project: {
            _id: 0, // Exclude _id from the result
            year: "$_id.year", // Include year
            month: "$_id.month", // Include month
            week: "$_id.week", // Include week
            day: "$_id.day", // Include day
            count: 1, // Include the count of feedback grouped by the date
          },
        },
      ];

      const getAppreciationFeedbackPipeline = () => [
        {
          $match: {
            employeeId: mongoose.Types.ObjectId(userId), // Match by employeeId
            active: true, // Only active feedback
            feedbackType: "appreciation", // Match only "appreciation" feedback
            ...(startTimestamp && endTimestamp && { createdAt: { $gte: startTimestamp, $lte: endTimestamp } }),
          },
        },
        {
          $group: getGroupData(dateType), // Group by dateType (day, week, month, year)
        },
        {
          $sort: {
            "_id.year": 1, // Sort by year in ascending order
            "_id.month": 1, // Sort by month in ascending order
            "_id.week": 1, // Sort by week in ascending order
            "_id.day": 1, // Sort by day in ascending order
          },
        },
        {
          $project: {
            _id: 0, // Exclude _id from the result
            year: "$_id.year", // Include year
            month: "$_id.month", // Include month
            week: "$_id.week", // Include week
            day: "$_id.day", // Include day
            count: 1, // Include the count of feedback grouped by the date
          },
        },
      ];

      const getProjectsPipeline = () => [
        {
          // Match the documents with filters
          $match: {
            ...(startTimestamp && endTimestamp && { createdAt: { $gte: startTimestamp, $lte: endTimestamp } }),
            employeeId: mongoose.Types.ObjectId(userId), // Filter by employee ID
            active: true, // Include only active projects
          },
        },
        {
          // Lookup to join with the Projects collection
          $lookup: {
            from: "projects", // Name of the Projects collection
            localField: "projectId", // Field in workAllocations
            foreignField: "_id", // Field in Projects
            as: "projectDetails", // Alias for the resulting array
          },
        },
        {
          // Project relevant fields and extract projectName
          $project: {
            employeeId: 1,
            taskName: 1,
            activityName: 1,
            projectName: { $arrayElemAt: ["$projectDetails.projectName", 0] }, // Extract projectName
            createdAt: 1, // Include createdAt for grouping
          },
        },
        {
          // Group by the specified date granularity and projectName
          $group: {
            _id: {
              ...getGroupData(dateType)._id, // Group by date based on `dateType` (day, week, month, year)
              projectName: "$projectName", // Group by project name
            },
          },
        },
        {
          // Group again to count unique projects per date
          $group: {
            _id: {
              day: "$_id.day", // Flatten day
              month: "$_id.month", // Flatten month
              week: "$_id.week", // Flatten week
              year: "$_id.year", // Flatten year
            },
            Projects: { $sum: 1 }, // Count the number of unique projects
          },
        },
        {
          $sort: {
            "_id.year": 1, // Sort by year ascending
            "_id.month": 1, // Sort by month ascending
            "_id.week": 1, // Sort by week ascending
            "_id.day": 1, // Sort by day ascending
          },
        },
        {
          // Format the output
          $project: {
            _id: 0, // Remove the _id field
            Projects: 1, // Include the total project count
            year: "$_id.year", // Flatten year
            month: "$_id.month", // Flatten month
            week: "$_id.week", // Flatten week
            day: "$_id.day", // Flatten day
          },
        },
      ];

      const getStatusPipeline = () => [
        {
          $match: {
            managerId: mongoose.Types.ObjectId(userId), // Filter by managerId
            ...(startTimestamp && endTimestamp && { createdAt: { $gte: startTimestamp, $lte: endTimestamp } }),

            active: true, // Only include active tasks
            // createdAt: { $gte: startTimestamp, $lte: endTimestamp }, // Filter by date range
            status: { $in: ["pending", "approved", "rejected"] }, // Filter by task status
          },
        },
        {
          $group: {
            _id: {
              ...getGroupData(dateType)._id, // Group by date based on `dateType` (day, week, month, year)
              status: "$status", // Group by task status
            },
            count: { $sum: 1 }, // Count the number of tasks per group
          },
        },
        {
          $group: {
            _id: {
              day: "$_id.day", // Flatten day
              month: "$_id.month", // Flatten month
              week: "$_id.week", // Flatten week
              year: "$_id.year", // Flatten year
            },
            pendingTaskCount: {
              $sum: {
                $cond: [
                  { $eq: ["$_id.status", "pending"] }, // If the status is "pending"
                  "$count", // Add to pendingTaskCount
                  0,
                ],
              },
            },
            approvedTaskCount: {
              $sum: {
                $cond: [
                  { $eq: ["$_id.status", "approved"] }, // If the status is "approved"
                  "$count", // Add to approvedTaskCount
                  0,
                ],
              },
            },
            rejectedTaskCount: {
              $sum: {
                $cond: [
                  { $eq: ["$_id.status", "rejected"] }, // If the status is "approved"
                  "$count", // Add to approvedTaskCount
                  0,
                ],
              },
            },
          },
        },
        {
          $sort: {
            "_id.year": 1, // Sort by year ascending
            "_id.month": 1, // Sort by month ascending
            "_id.week": 1, // Sort by week ascending
            "_id.day": 1, // Sort by day ascending
          },
        },
        {
          $project: {
            _id: 0, // Exclude the `_id` field
            year: "$_id.year", // Flatten year
            month: "$_id.month", // Flatten month
            week: "$_id.week", // Flatten week
            day: "$_id.day", // Flatten day
            pendingTaskCount: 1, // Include pending task count
            approvedTaskCount: 1, // Include approved task count
            rejectedTaskCount: 1,
          },
        },
      ];
      const projectStatus = () => [
        {
          $match: {
            projectHead: mongoose.Types.ObjectId(userId), // Filter by projectHead (userId)
            active: true, // Only include active projects
            ...(startTimestamp && endTimestamp && { createdAt: { $gte: startTimestamp, $lte: endTimestamp } }),
          },
        },
        {
          $group: {
            _id: {
              ...getGroupData(dateType)._id, // Group by date based on `dateType` (day, week, month, year)
              projectHead: "$projectHead", // Group by projectHead
            },
            ongoing: {
              $sum: {
                $cond: [
                  { $in: ["$projectStatus", ["open", "allocated", "reopened"]] }, // If project status is ongoing
                  1, // Count 1 for ongoing projects
                  0, // Count 0 for non-ongoing statuses
                ],
              },
            },
            completed: {
              $sum: {
                $cond: [
                  { $eq: ["$projectStatus", "completed"] }, // If project status is completed
                  1, // Count 1 for completed projects
                  0, // Count 0 for non-completed statuses
                ],
              },
            },
          },
        },
        {
          $project: {
            _id: 0, // Exclude the _id field
            year: "$_id.year", // Flatten year
            month: "$_id.month", // Flatten month
            week: "$_id.week", // Flatten week
            day: "$_id.day", // Flatten day
            ongoing: 1, // Include ongoing project count
            completed: 1, // Include completed project count
          },
        },
      ];

      const activeCount = () => [
        {
          $match: {
            managerId: mongoose.Types.ObjectId(userId),
            ...(startTimestamp &&
              endTimestamp && {
                createdAt: { $gte: startTimestamp, $lte: endTimestamp },
              }),
          },
        },
        {
          $unwind: "$employeeId", // Unwind employeeId array
        },
        {
          $lookup: {
            from: "users",
            localField: "employeeId",
            foreignField: "_id",
            as: "employeeDetails", // Lookup employee details from the User collection
          },
        },
        {
          $unwind: "$employeeDetails", // Unwind the employeeDetails array
        },
        {
          // Group by active status and the dateType grouping, collect unique employee IDs
          $group: {
            _id: {
              active: "$employeeDetails.active", // Group by active status (true or false)
              ...getGroupData(dateType)._id, // Include grouping logic based on dateType
            },
            uniqueEmployeeIds: { $addToSet: "$employeeId" }, // Collect unique employee IDs
          },
        },
        {
          // Calculate counts based on the unique employee IDs
          $project: {
            _id: 1,
            active: "$_id.active",
            uniqueCount: { $size: "$uniqueEmployeeIds" }, // Count unique employees
          },
        },
        {
          // Re-group to combine active and inactive counts into a single document
          $group: {
            _id: {
              day: "$_id.day",
              week: "$_id.week",
              month: "$_id.month",
              year: "$_id.year",
            },
            activeCount: {
              $sum: { $cond: [{ $eq: ["$_id.active", true] }, "$uniqueCount", 0] },
            },
            inactiveCount: {
              $sum: { $cond: [{ $eq: ["$_id.active", false] }, "$uniqueCount", 0] },
            },
          },
        },
        {
          $project: {
            _id: 0,
            day: "$_id.day",
            week: "$_id.week",
            month: "$_id.month",
            year: "$_id.year",
            activeCount: 1,
            inactiveCount: 1,
          },
        },
        {
          // Sort by the date hierarchy (year -> month -> week -> day)
          $sort: {
            year: 1,
            month: 1,
            week: 1,
            day: 1,
          },
        },
      ];
      const Mangerstask = () => [
        {
          $match: {
            managerId: mongoose.Types.ObjectId(userId),
            ...(startTimestamp && endTimestamp && { createdAt: { $gte: startTimestamp, $lte: endTimestamp } }),
          },
        },
        {
          $group: {
            _id: {
              ...getGroupData(dateType)._id,
              taskStatus: "$taskStatus", // Group by taskStatus
            },
            count: { $sum: 1 }, // Count the number of tasks per status
          },
        },
        {
          $project: {
            _id: 0, // Remove the default _id field
            day: "$_id.day", // Flatten the day field
            week: "$_id.week", // Flatten the week field
            month: "$_id.month", // Flatten the month field
            year: "$_id.year", // Flatten the year field
            taskStatus: "$_id.taskStatus", // Flatten the taskStatus field
            count: 1, // Include the count of each taskStatus
          },
        },
        {
          $sort: {
            year: 1,
            month: 1,
            week: 1,
            day: 1,
          }, // Sort results by year, month, week, and day
        },
      ];

      const Organizationtask = () => [
        {
          $match: {
            organizationId: mongoose.Types.ObjectId(userId),
            active: true, // Only include active tasks
            ...(startTimestamp && endTimestamp && { createdAt: { $gte: startTimestamp, $lte: endTimestamp } }),
          },
        },
        {
          $group: {
            _id: {
              ...getGroupData(dateType)._id, // Grouping by dynamic date field
              taskStatus: "$taskStatus", // Group by taskStatus
            },
            count: { $sum: 1 }, // Sum the total tasks
          },
        },
        {
          $project: {
            _id: 0, // Exclude _id field
            taskStatus: { $ifNull: ["$_id.taskStatus", 0] },
            count: { $ifNull: ["$count", 0] }, // Ensure count is 0 if null
            day: { $ifNull: ["$day", dates.day] },
            year: { $ifNull: ["$year", dates.year] },
            month: { $ifNull: ["$month", dates.month] },
            week: "$_id.week",
          },
        },

        // {
        //   $project: {
        //     _id: 0, // Exclude the `_id` field
        //     year: "$_id.year", // Flatten year
        //     month: "$_id.month", // Flatten month
        //     week: "$_id.week", // Flatten week
        //     day: "$_id.day", // Flatten day (if available)
        //     // Flatten taskStatus
        //     count: 1, // Include the count of tasks
        //   },
        // },

        {
          $sort: {
            year: 1, // Sort by year ascending
            month: 1, // Sort by month ascending
            week: 1, // Sort by week ascending
            day: 1, // Sort by day ascending
            taskStatus: 1, // Sort by taskStatus (optional)
          },
        },
      ];
      const OrganizationCustomer = () => [
        {
          $match: {
            organizationId: mongoose.Types.ObjectId(userId),
            ...(startTimestamp && endTimestamp && { createdAt: { $gte: startTimestamp, $lte: endTimestamp } }),
          },
        },
        {
          $group: {
            _id: {
              ...getGroupData(dateType)._id, // Dynamic grouping based on dateType
            },
            activeCount: {
              $sum: { $cond: [{ $eq: ["$active", true] }, 1, 0] }, // Count active items
            },
            inactiveCount: {
              $sum: { $cond: [{ $eq: ["$active", false] }, 1, 0] }, // Count inactive items
            },
            count: { $sum: 1 }, // Total count
          },
        },
        {
          $project: {
            _id: 0, // Exclude the `_id` field
            year: "$_id.year", // Flatten year
            month: "$_id.month", // Flatten month
            week: "$_id.week", // Flatten week
            day: "$_id.day", // Flatten day (if present in grouping)
            activeCount: 1, // Include activeCount
            inactiveCount: 1, // Include inactiveCount
            count: 1, // Include total count
          },
        },
        {
          $sort: {
            year: 1, // Sort by year ascending
            month: 1, // Sort by month ascending
            week: 1, // Sort by week ascending
            day: 1, // Sort by day ascending
          },
        },
      ];

      const OrganizationPrjectStatus = () => [
        {
          $match: {
            organizationId: mongoose.Types.ObjectId(userId),
            ...(startTimestamp && endTimestamp && { createdAt: { $gte: startTimestamp, $lte: endTimestamp } }),

            active: true, // Match organization ID
          },
        },
        {
          $addFields: {
            createdAtDate: { $toDate: { $multiply: ["$createdAt", 1000] } }, // Convert createdAt to Date
          },
        },
        {
          $facet: {
            pendingProjects: [
              {
                $match: {
                  projectStatus: { $in: ["open", "allocated", "reopened"] }, // Match pending statuses
                },
              },
              {
                $group: {
                  ...getGroupData(dateType), // Dynamically group fields based on dateType
                  pendingCount: { $sum: 1 },
                },
              },
            ],
            completedProjects: [
              {
                $match: {
                  projectStatus: "completed", // Match completed status
                },
              },
              {
                $group: {
                  ...getGroupData(dateType), // Dynamically group fields based on dateType
                  completedCount: { $sum: 1 },
                },
              },
            ],
          },
        },
        {
          $project: {
            projectStatus: [
              {
                status: "pending",
                count: { $arrayElemAt: ["$pendingProjects.pendingCount", 0] },
                day: { $arrayElemAt: ["$pendingProjects._id.day", 0] },
                year: { $arrayElemAt: ["$pendingProjects._id.year", 0] },
                month: { $arrayElemAt: ["$pendingProjects._id.month", 0] },
                week: { $arrayElemAt: ["$pendingProjects._id.week", 0] },
              },
              {
                status: "completed",
                count: { $arrayElemAt: ["$completedProjects.completedCount", 0] },
                day: { $arrayElemAt: ["$completedProjects._id.day", 0] },
                year: { $arrayElemAt: ["$completedProjects._id.year", 0] },
                month: { $arrayElemAt: ["$completedProjects._id.month", 0] },
                week: { $arrayElemAt: ["$completedProjects._id.week", 0] },
              },
            ],
          },
        },
        {
          $unwind: "$projectStatus", // Unwind the array to get separate documents for each status
        },
        {
          $replaceRoot: { newRoot: "$projectStatus" }, // Replace root with the flattened project status
        },
        {
          $project: {
            _id: 0, // Exclude _id field
            status: 1,
            count: { $ifNull: ["$count", 0] }, // Ensure count is 0 if null
            day: { $ifNull: ["$day", dates.day] },
            year: { $ifNull: ["$year", dates.year] },
            month: { $ifNull: ["$month", dates.month] },
            week: 1,
          },
        },
      ];

      const OrganizationtoltalCount = () => [
        {
          $match: {
            organizationId: mongoose.Types.ObjectId(userId), // Match the organization ID
            userType: { $in: ["Manager", "Employee", "manager", "employee"] }, // Filter by userType
            active: true, // Include only active users
            ...(startTimestamp && endTimestamp && { createdAt: { $gte: startTimestamp, $lte: endTimestamp } }),
          },
        },
        {
          $group: {
            _id: {
              ...getGroupData(dateType)._id, // Use dynamic grouping logic from getGroupData
            },
            managerCount: {
              $sum: {
                $cond: [{ $or: [{ $eq: ["$userType", "Manager"] }, { $eq: ["$userType", "manager"] }] }, 1, 0], // Increment for Managers (case-insensitive logic included)
              },
            },
            employeeCount: {
              $sum: {
                $cond: [{ $or: [{ $eq: ["$userType", "Employee"] }, { $eq: ["$userType", "employee"] }] }, 1, 0], // Increment for Employees
              },
            },
          },
        },
        {
          $project: {
            _id: 0, // Exclude `_id`
            day: "$_id.day", // Include day if present
            year: "$_id.year", // Include year if present
            month: "$_id.month", // Include month if present
            week: "$_id.week", // Include week if present
            managerCount: 1, // Include manager count
            employeeCount: 1, // Include employee count
          },
        },
      ];
      // Function to get the ISO week number for a given date
      function getISOWeek(date) {
        const tempDate = new Date(date.getTime());
        tempDate.setHours(0, 0, 0, 0); // Reset time for consistency
        tempDate.setDate(tempDate.getDate() + 3 - ((tempDate.getDay() + 6) % 7)); // ISO 8601 standard (weeks start on Monday)
        const firstThursday = new Date(tempDate.getFullYear(), 0, 4); // Get the first Thursday of the year
        const weekNumber = Math.ceil(((tempDate - firstThursday) / 86400000 + 1) / 7); // Calculate the week number
        return weekNumber;
      }

      const dates = {
        year: new Date().getFullYear(),
        month: new Date().getMonth() + 1, // Months are 0-indexed, so we add 1
        // week: new Date().getWeek(), // Assuming you have a method or package to get the current week number
        day: new Date().getDate(),
      };
      let result;

      if (userType === "employee") {
        // Handle employee-specific logic
        if (option === "allocations") {
          console.log("Fetching allocations for employee...");
          const workAllocations = await WorkAllocations.aggregate(getWorkAllocationsPipeline());
          result =
            workAllocations.length > 0
              ? workAllocations
              : [
                  {
                    year: dates.year,
                    month: dates.month,
                    week: dates.week,
                    day: dates.day,
                    taskStatus: "No workAllocations",
                    count: 0,
                  },
                ];
        } else if (option === "rating") {
          const rating = await Feedback.aggregate(getFeedbackPipeline());
          result =
            rating.length > 0
              ? rating
              : [
                  {
                    year: dates.year,
                    month: dates.month,
                    week: dates.week,
                    day: dates.day,
                    projectId: "No rating",
                    projectName: "No rating",
                    count: 0,
                  },
                ];
        } else if (option === "appreciation") {
          const appreciation = await Feedback.aggregate(getAppreciationFeedbackPipeline());
          result =
            appreciation.length > 0
              ? appreciation
              : [
                  {
                    year: dates.year,
                    month: dates.month,
                    week: dates.week,
                    day: dates.day,
                    projectId: "No appreciation",
                    projectName: "No appreciation",
                    count: 0,
                  },
                ];
        } else if (option === "project") {
          const projects = await WorkAllocations.aggregate(getProjectsPipeline());
          result =
            projects.length > 0
              ? projects
              : [
                  {
                    year: dates.year,
                    month: dates.month,
                    week: dates.week,
                    day: dates.day,
                    Projects: 0,
                    count: 0,
                  },
                ];
        } else {
          throw new Error("Invalid option for employee.");
        }
      } else if (userType === "manager") {
        // Handle manager-specific logic
        if (option === "allocations") {
          console.log("Fetching allocations for manager...");
          const managertask = await WorkAllocations.aggregate(Mangerstask());
          result =
            managertask.length > 0
              ? managertask
              : [
                  {
                    year: dates.year,
                    month: dates.month,
                    week: dates.week,
                    day: dates.day,
                    taskStatus: "No taskstatus",
                    count: 0,
                  },
                ];
          managertask;
        } else if (option === "timesheet") {
          const statuses = await TimeSheet.aggregate(getStatusPipeline());
          result =
            statuses.length > 0
              ? statuses
              : [
                  {
                    year: dates.year,
                    month: dates.month,
                    week: dates.week,
                    day: dates.day,
                    pendingTaskCount: 0,
                    approvedTaskCount: 0, // Include approved task count
                    rejectedTaskCount: 0,
                    count: 0,
                  },
                ];
          statuses;
        } else if (option === "projectstatus") {
          const projectstatuses = await Projects.aggregate(projectStatus());
          result =
            projectstatuses.length > 0
              ? projectstatuses
              : [
                  {
                    year: dates.year,
                    month: dates.month,
                    week: dates.week,
                    day: dates.day,
                    count: 0,
                  },
                ];
          projectstatuses;
        } else if (option === "employees") {
          const activecount = await WorkAllocations.aggregate(activeCount());
          result =
            activecount.length > 0
              ? activecount
              : [
                  {
                    year: dates.year,
                    month: dates.month,
                    week: dates.week,
                    day: dates.day,
                    activeCount: 0,
                    inactiveCount: 0,
                    count: 0,
                  },
                ];
          activecount;
        } else {
          throw new Error("Invalid option for manager.");
        }
      } else if (userType === "tls") {
        // Handle manager-specific logic
        if (option === "allocations") {
          console.log("Fetching allocations for manager...");
          const managertask = await WorkAllocations.aggregate(Mangerstask());
          result =
            managertask.length > 0
              ? managertask
              : [
                  {
                    year: dates.year,
                    month: dates.month,
                    week: dates.week,
                    day: dates.day,
                    taskStatus: "No taskstatus",
                    count: 0,
                  },
                ];
          managertask;
        } else if (option === "timesheet") {
          const statuses = await TimeSheet.aggregate(getStatusPipeline());
          result =
            statuses.length > 0
              ? statuses
              : [
                  {
                    year: dates.year,
                    month: dates.month,
                    week: dates.week,
                    day: dates.day,
                    pendingTaskCount: 0,
                    approvedTaskCount: 0, // Include approved task count
                    rejectedTaskCount: 0,
                    count: 0,
                  },
                ];
          statuses;
        } else if (option === "projectstatus") {
          const projectstatuses = await Projects.aggregate(projectStatus());
          result =
            projectstatuses.length > 0
              ? projectstatuses
              : [
                  {
                    year: dates.year,
                    month: dates.month,
                    week: dates.week,
                    day: dates.day,
                    count: 0,
                  },
                ];
          projectstatuses;
        } else if (option === "employees") {
          const activecount = await WorkAllocations.aggregate(activeCount());
          result =
            activecount.length > 0
              ? activecount
              : [
                  {
                    year: dates.year,
                    month: dates.month,
                    week: dates.week,
                    day: dates.day,
                    activeCount: 0,
                    inactiveCount: 0,
                    count: 0,
                  },
                ];
          activecount;
        } else {
          throw new Error("Invalid option for manager.");
        }
      } else if (userType === "organization admin") {
        // Handle organization-specific logic
        if (option === "allocations") {
          // console.log("Fetching allocations for organization...");
          const organizationtask = await WorkAllocations.aggregate(Organizationtask());
          result =
            organizationtask.length > 0
              ? organizationtask
              : [
                  {
                    year: dates.year,
                    month: dates.month,
                    week: dates.week,
                    day: dates.day,
                    taskStatus: "No taskstatus",
                    count: 0,
                  },
                ];
          organizationtask;
        } else if (option === "customers") {
          const organizationcustomer = await Customer.aggregate(OrganizationCustomer());
          result =
            organizationcustomer.length > 0
              ? organizationcustomer
              : [
                  {
                    year: dates.year,
                    month: dates.month,
                    week: dates.week,
                    day: dates.day,
                    activeCount: 0,
                    inactiveCount: 0,
                    count: 0,
                  },
                ];
          organizationcustomer;
        } else if (option === "projects") {
          const projectstatus = await Projects.aggregate(OrganizationPrjectStatus());
          result =
            projectstatus.length > 0
              ? projectstatus
              : [
                  {
                    year: dates.year,
                    month: dates.month,
                    week: dates.week,
                    day: dates.day,
                    projectStatus: 0,
                    status: 0,
                    count: 0,
                  },
                ];
        } else if (option === "employees") {
          const empcount = await User.aggregate(OrganizationtoltalCount());
          result =
            empcount.length > 0
              ? empcount
              : [
                  {
                    year: dates.year,
                    month: dates.month,
                    week: dates.week,
                    day: dates.day,
                    managerCount: 0, // Include manager count
                    employeeCount: 0,
                    count: 0,
                  },
                ];
        } else {
          throw new Error("Invalid option for organization.");
        }
      } else {
        throw new Error("Invalid user type. Allowed values are 'employee', 'manager', or 'organization'.");
      }
      // Send success response
      UtilController.sendSuccess(req, res, next, { result });
    } catch (error) {
      // Handle and send error response
      UtilController.sendError(req, res, next, error.message || error);
    }
  },

  getAvailableOptions: (req, res, next) => {
    try {
      const userType = req.session?.userType || req.body?.userType;
      // Validate the userType

      const userTypeOptions = {
        Employee: [
          { name: "Allocations", value: "allocations" },
          { name: "Rating", value: "rating" },
          { name: "Appreciation", value: "appreciation" },
          { name: "Project", value: "project" },
        ],
        Manager: [
          { name: "Timesheet", value: "timesheet" },
          { name: "Project Status", value: "projectstatus" },
          { name: "Employees", value: "employees" },
          { name: "Allocations", value: "allocations" },
        ],
        TLS: [
          { name: "Timesheet", value: "timesheet" },
          { name: "Project Status", value: "projectstatus" },
          { name: "Employees", value: "employees" },
          { name: "Allocations", value: "allocations" },
        ],
        "Organization Admin": [
          { name: "Allocations", value: "allocations" },
          { name: "Customer", value: "customers" },
          { name: "Project", value: "projects" },
          { name: "Employees", value: "employees" },
        ],
      };
      if (!userTypeOptions[userType]) {
        throw new Error(`Invalid userType. Allowed values are 'Employee', 'Manager', or 'Organization Admin'.`);
      }

      // Return the options for the given userType
      const options = userTypeOptions[userType];
      UtilController.sendSuccess(req, res, next, { userType, options });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },

  getGraphDataOrganizationgraph: async (req, res, next) => {
    try {
      const { userId, startDate, endDate, dateType, option, userType } = req.body;

      if (!userId) {
        return UtilController.sendError(req, res, next, "User ID is required");
      }

      let data = {};
      let start, end;

      if (startDate && endDate) {
        start = new Date(startDate * 1000); // Convert from epoch time (seconds) to Date object
        end = new Date(endDate * 1000);
      } else {
        // Calculate start and end based on dateType
        const dateRange = getDateRange(dateType);
        start = new Date(dateRange.start * 1000); // Ensure these are Date objects
        end = new Date(dateRange.end * 1000);
      }

      if (userType === "Organisation Admin") {
        if (option === "taskStatus") {
          data = await WorkAllocations.aggregate([
            {
              $match: {
                organizationId: mongoose.Types.ObjectId(userId),
                active: true,
                createdAt: { $gte: start.getTime() / 1000, $lte: end.getTime() / 1000 }, // Use epoch time (seconds)
              },
            },
            {
              $group: {
                _id: "$taskStatus",
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
          ]);
        } else if (option === "Customer") {
          data = await Customer.aggregate([
            {
              $match: {
                organizationId: mongoose.Types.ObjectId(userId),
                createdAt: { $gte: start.getTime() / 1000, $lte: end.getTime() / 1000 }, // Use epoch time (seconds)
              },
            },
            {
              $group: {
                _id: "$organizationId",
                activeCount: {
                  $sum: { $cond: [{ $eq: ["$active", true] }, 1, 0] },
                },
                inactiveCount: {
                  $sum: { $cond: [{ $eq: ["$active", false] }, 1, 0] },
                },
              },
            },
          ]);
        } else if (option === "Project") {
          data = await Projects.aggregate([
            {
              $match: {
                organizationId: mongoose.Types.ObjectId(userId),
                createdAt: { $gte: start.getTime() / 1000, $lte: end.getTime() / 1000 }, // Use epoch time (seconds)
              },
            },
            {
              $facet: {
                pendingProjects: [
                  { $match: { projectStatus: { $in: ["open", "allocated", "reopened"] } } },
                  { $count: "count" },
                ],
                completedProjects: [{ $match: { projectStatus: "completed" } }, { $count: "count" }],
              },
            },
          ]);
        } else if (option === "CountOfEmployee") {
          data = await WorkAllocations.aggregate([
            {
              $match: {
                organizationId: mongoose.Types.ObjectId(userId),
                createdAt: { $gte: start.getTime() / 1000, $lte: end.getTime() / 1000 }, // Use epoch time (seconds)
              },
            },
            { $unwind: "$employeeId" },
            {
              $group: {
                _id: "$organizationId",
                managerCount: { $addToSet: "$managerId" },
                employeeCount: { $addToSet: "$employeeId" },
              },
            },
            {
              $project: {
                managerCount: { $size: "$managerCount" },
                employeeCount: { $size: "$employeeCount" },
              },
            },
          ]);
        } else {
          return UtilController.sendError(req, res, next, "Invalid option. Please select a valid option.");
        }
      }

      // Convert start and end dates back to epoch time (seconds) for response
      const responseData = {
        startDate: Math.floor(start.getTime() / 1000), // Convert back to epoch time (seconds)
        endDate: Math.floor(end.getTime() / 1000),
        data,
      };

      UtilController.sendSuccess(req, res, next, responseData);
    } catch (error) {
      console.error("Error in getGraphData:", error);
      return UtilController.sendError(req, res, next, "Server Error", error.message);
    }
  },

  // getDateRange: async (req, res, next) => {
  //   const dateType = req.body.dateType; // Example: 'day', 'week', 'month', 'year'

  //   if (!dateType) {
  //     return res.status(400).send("dateType query parameter is required");
  //   }

  //   const dateRange = getDateRange(dateType);

  //   console.log("getDateRange", dateRange); // Log the result to console
  //   res.json(dateRange); // Send the result to Postman or the client
  // },

  workallocations: async (req, res, next) => {
    try {
      // const userId = req.session.userId || req.body.userId;
      const userId = req.body.userId;
      if (!userId) {
        return UtilController.sendError(req, res, next, { message: "User ID is required" });
      }
      const allocations = await WorkAllocations.find({ employeeId: { $in: userId } })
        .select("domain taskName priority projectId")
        .populate("projectId", "projectName");
      if (allocations.length === 0) {
        return UtilController.sendSuccess(req, res, next, []);
      }
      const totalCount = allocations.length;

      if (allocations.length === 0) {
        return UtilController.sendSuccess({
          responseCode: returnCode.notAvailable,
          message: "No allocations found for provided employee IDs",
          data: null,
        });
      }

      UtilController.sendSuccess(req, res, next, {
        responseCode: returnCode.validSession,
        data: { allocations, totalCount },
      });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },

  getFeedbackByEmployeeId: async (req, res, next) => {
    try {
      const { employeeId } = req.body;

      // Find all feedback for the given employeeId
      const feedback = await Feedback.find({ employeeId, active: true })
        .populate("managerId", "fname lname") // Populate manager details if needed
        .populate("organizationId", "name") // Populate organization details if needed
        .exec();

      if (!feedback || feedback.length === 0) {
        return res.status(404).json({
          message: "No feedback found for the specified employee.",
        });
      }

      // Separate rating and appreciation feedback
      const ratings = feedback.filter(fb => fb.feedbackType === "rating");
      const appreciations = feedback.filter(fb => fb.feedbackType === "appreciation");

      return res.status(200).json({
        message: "Feedback retrieved successfully",
        data: {
          ratings,
          appreciations,
        },
      });
    } catch (error) {
      console.error("Error retrieving feedback:", error);
      return res.status(500).json({
        message: "Error retrieving feedback",
        error: error.message,
      });
    }
  },

  employeeAssignOrganiztion: async (req, res, next) => {
    const { organizationId } = req.session;
    const { employeeId } = req.body;
    try {
      const result = await WorkAllocations.aggregate([
        {
          // Match WorkAllocation documents with the given organizationId and employeeId
          $match: {
            organizationId: mongoose.Types.ObjectId(organizationId),
            employeeId: mongoose.Types.ObjectId(employeeId),
            active: true,
          },
        },
        {
          // Lookup to fetch project details from the Projects collection
          $lookup: {
            from: "projects", // Name of the projects collection
            localField: "projectId",
            foreignField: "_id",
            as: "projectDetails",
          },
        },
        {
          $unwind: {
            path: "$projectDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          // Lookup to fetch project head details
          $lookup: {
            from: "users", // Name of the users collection (or relevant collection for project heads)
            localField: "projectDetails.projectHead",
            foreignField: "_id",
            as: "projectHeadDetails",
          },
        },
        {
          // Lookup to fetch timesheet details related to this WorkAllocation
          $lookup: {
            from: "timesheets", // Name of the timesheets collection
            localField: "_id",
            foreignField: "workAllocationId",
            as: "timesheetDetails",
          },
        },
        {
          // Modify the timesheetDurations to remove empty arrays
          $addFields: {
            workAllocationDuration: "$duration",
            timesheetDurations: {
              $filter: {
                input: {
                  $map: {
                    input: "$timesheetDetails",
                    as: "timesheet",
                    in: "$$timesheet.duration",
                  },
                },
                as: "duration",
                cond: { $ne: ["$$duration", []] }, // Remove empty arrays
              },
            },
            projectHeadNames: {
              $filter: {
                input: "$projectHeadDetails.fname",
                as: "head",
                cond: { $ne: ["$$head", ""] }, // Remove empty project head names
              },
            },
          },
        },
        {
          // Group by projectId to calculate common times worked on the same project
          $group: {
            _id: "$projectId",
            projectName: { $first: "$projectDetails.projectName" },
            organizationId: { $first: "$organizationId" },
            workAllocationDurations: { $push: "$workAllocationDuration" },
            timesheetDurations: {
              $push: {
                $cond: {
                  if: { $gt: [{ $size: "$timesheetDurations" }, 0] }, // Only include non-empty arrays
                  then: "$timesheetDurations",
                  else: null,
                },
              },
            },
            projectHeadNames: {
              $addToSet: "$projectHeadDetails.fname",
            },
          },
        },
        {
          // Filter out null values from the timesheetDurations array
          $addFields: {
            timesheetDurations: {
              $filter: {
                input: "$timesheetDurations",
                as: "duration",
                cond: { $ne: ["$$duration", null] }, // Remove null values (empty arrays)
              },
            },
          },
        },

        {
          $project: {
            _id: 1,
            projectName: 1,
            organizationId: 1,
            workAllocationDurations: 1,
            timesheetDurations: 1,
            projectHeadNames: 1,
            commonTimesheetDurations: 1,
          },
        },
      ]);

      UtilController.sendSuccess(req, res, next, {
        result,
        responseCode: returnCode.validSession,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },

  employeeAssignManager: async (req, res, next) => {
    const { userId } = req.session;
    const { employeeId } = req.body;
    try {
      // Aggregate query to fetch project name, task durations, and number of times an employee has worked on a task
      const result = await WorkAllocations.aggregate([
        {
          $match: {
            managerId: mongoose.Types.ObjectId(userId),
            employeeId: mongoose.Types.ObjectId(employeeId),
            active: true,
          },
        },
        {
          // Lookup to fetch project details from the Projects collection
          $lookup: {
            from: "projects", // Name of the projects collection
            localField: "projectId",
            foreignField: "_id",
            as: "projectDetails",
          },
        },
        {
          $unwind: {
            path: "$projectDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          // Lookup to fetch project head details
          $lookup: {
            from: "users", // Name of the users collection (or relevant collection for project heads)
            localField: "projectDetails.projectHead",
            foreignField: "_id",
            as: "projectHeadDetails",
          },
        },
        {
          // Lookup to fetch timesheet details related to this WorkAllocation
          $lookup: {
            from: "timesheets", // Name of the timesheets collection
            localField: "_id",
            foreignField: "workAllocationId",
            as: "timesheetDetails",
          },
        },
        {
          // Modify the timesheetDurations to remove empty arrays
          $addFields: {
            workAllocationDuration: "$duration",
            timesheetDurations: {
              $filter: {
                input: {
                  $map: {
                    input: "$timesheetDetails",
                    as: "timesheet",
                    in: "$$timesheet.duration",
                  },
                },
                as: "duration",
                cond: { $ne: ["$$duration", []] }, // Remove empty arrays
              },
            },
            projectHeadNames: {
              $filter: {
                input: "$projectHeadDetails.fname",
                as: "head",
                cond: { $ne: ["$$head", ""] }, // Remove empty project head names
              },
            },
          },
        },
        {
          // Group by projectId to calculate common times worked on the same project
          $group: {
            _id: "$projectId",
            projectName: { $first: "$projectDetails.projectName" },
            organizationId: { $first: "$organizationId" },
            workAllocationDurations: { $push: "$workAllocationDuration" },
            timesheetDurations: {
              $push: {
                $cond: {
                  if: { $gt: [{ $size: "$timesheetDurations" }, 0] }, // Only include non-empty arrays
                  then: "$timesheetDurations",
                  else: null,
                },
              },
            },
            projectHeadNames: {
              $addToSet: "$projectHeadDetails.fname",
            },
          },
        },
        {
          // Filter out null values from the timesheetDurations array
          $addFields: {
            timesheetDurations: {
              $filter: {
                input: "$timesheetDurations",
                as: "duration",
                cond: { $ne: ["$$duration", null] }, // Remove null values (empty arrays)
              },
            },
          },
        },

        {
          $project: {
            _id: 1,
            projectName: 1,
            organizationId: 1,
            workAllocationDurations: 1,
            timesheetDurations: 1,
            projectHeadNames: 1,
            commonTimesheetDurations: 1,
          },
        },
      ]);

      // Send the aggregated result in response
      UtilController.sendSuccess(req, res, next, {
        result: result,
        responseCode: returnCode.validSession,
      });
    } catch (err) {
      // Handle errors
      UtilController.sendError(req, res, next, err);
    }
  },
};
