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

};
