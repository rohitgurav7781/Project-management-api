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

};
