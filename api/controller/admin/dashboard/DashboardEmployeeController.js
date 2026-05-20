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
  getDashboardCountEmployee: async (req, res, next) => {
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

      const feedbackCounts = await Feedback.aggregate([
        {
          $match: {
            employeeId: mongoose.Types.ObjectId(userId),
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

      const result = await TimeSheet.aggregate([
        {
          $match: {
            employeeId: mongoose.Types.ObjectId(userId),
            status: "approved",
          },
        },
        {
          $group: {
            _id: null,
            totalDuration: { $sum: "$durationRequired" },
          },
        },
      ]);

      const totalDuration = result[0]?.totalDuration / 60 || 0;
      const taskData = taskCounts[0] || { completedTaskCount: 0, missedDueDatesCount: 0 };

      const responseData = [
        { title: "Total Ratings", value: feedbackData.ratingCount },
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

  getDashboardCountEmployeeSession: async (req, res, next) => {
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
