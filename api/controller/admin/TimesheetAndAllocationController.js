const { Mongoose } = require("mongoose");
let mongoose = require("mongoose");
const { returnCode } = require("../../../config/responseCode");
const Tag = require("../../models/Tag");
const TimeSheet = require("../../models/Timesheet");
const TimesheetLogs = require("../../models/TimesheetLogs");
const UtilController = require("../services/UtilController");
const WorkAllocations = require("../../models/WorkAllocations");
const AllocationComments = require("../../models/AllocationActivityComments");
const SubactivityComments = require("../../models/AllocationSubActivityComments");
const User = require("../../models/User");
const NotificationController = require("../services/NotificationController");
const Notification = require("../../models/Notification");
const Activity = require("../../models/Activity");
const Projects = require("../../models/Project");

const STANDARD_WORKDAY_HOURS = 9.5;

async function sumEmployeeProjectDurationMinutes(employeeId, projectId, excludeTimesheetId) {
  if (!employeeId || !projectId || !mongoose.Types.ObjectId.isValid(String(projectId))) {
    return 0;
  }
  const filter = {
    employeeId: new mongoose.Types.ObjectId(String(employeeId)),
    projectId: new mongoose.Types.ObjectId(String(projectId)),
    active: true,
    status: { $ne: "rejected" },
  };
  if (excludeTimesheetId && mongoose.Types.ObjectId.isValid(String(excludeTimesheetId))) {
    filter._id = { $ne: new mongoose.Types.ObjectId(String(excludeTimesheetId)) };
  }
  const rows = await TimeSheet.find(filter).select("duration").lean();
  let total = 0;
  for (const row of rows) {
    total += module.exports.parseDurationToMinutes(row.duration || "");
  }
  return total;
}

async function validateProjectTimesheetHoursBudget({
  employeeId,
  projectId,
  entryDurationMinutes,
  batchExtraMinutes,
  excludeTimesheetId,
  startDateTime,
  endDateTime,
}) {
  if (!projectId || !mongoose.Types.ObjectId.isValid(String(projectId))) {
    return null;
  }
  const project = await Projects.findById(projectId)
    .select("projectHours estimatedHours startDate endDate projectName")
    .lean();
  if (!project) {
    return { projectHours: "Project not found for the selected project." };
  }
  const capHours = Number(project.projectHours);
  if (!Number.isFinite(capHours) || capHours <= 0) {
    return null;
  }

  if (project.startDate != null && Number(project.startDate) > 0 && startDateTime != null) {
    if (Number(startDateTime) < Number(project.startDate)) {
      return {
        startDateTime: `Timesheet cannot start before the project start date (${project.projectName || "project"}).`,
      };
    }
  }
  if (project.endDate != null && Number(project.endDate) > 0 && endDateTime != null) {
    if (Number(endDateTime) > Number(project.endDate)) {
      return {
        endDateTime: `Timesheet cannot end after the project end date (${project.projectName || "project"}).`,
      };
    }
  }

  const entryMin = Number(entryDurationMinutes) || 0;
  const batchExtra = Number(batchExtraMinutes) || 0;
  const existingMin = await sumEmployeeProjectDurationMinutes(employeeId, projectId, excludeTimesheetId);
  const capMinutes = capHours * 60;

  if (existingMin + batchExtra + entryMin > capMinutes + 1e-9) {
    const maxDays = (capHours / STANDARD_WORKDAY_HOURS).toFixed(2);
    const usedHours = ((existingMin + batchExtra) / 60).toFixed(2);
    return {
      duration: `Project hour budget exceeded for "${project.projectName || "project"}". Budget is ${capHours} h (about ${maxDays} days at ${STANDARD_WORKDAY_HOURS} h per day). You already have ${usedHours} h logged on this project for your timesheets, including other entries in this submission.`,
    };
  }
  return null;
}

module.exports = {
  parseDurationToMinutes: durationStr => {
    if (!durationStr || typeof durationStr !== "string") return 0;
    const nums = String(durationStr).trim().match(/\d+/g);
    if (!nums || nums.length === 0) return 0;
    const hours = parseInt(nums[0], 10);
    const minutes = nums[1] ? parseInt(nums[1], 10) : 0;
    if (isNaN(hours) || (nums[1] != null && isNaN(minutes))) return 0;
    return hours * 60 + minutes;
  },
  validateAndNormalizeDuration: durationStr => {
    if (!durationStr || typeof durationStr !== "string") return null;
    const nums = String(durationStr).trim().match(/\d+/g);
    if (!nums || nums.length === 0) return null;
    const hours = parseInt(nums[0], 10);
    const minutes = nums[1] ? parseInt(nums[1], 10) : 0;
    if (isNaN(hours) || (nums[1] != null && isNaN(minutes))) return null;
    return `${hours} hr : ${minutes} min`;
  },

  helperFunctionForTaskAssign: async (allocationForProject, projectDetails) => {
    for (const employeeId of allocationForProject.employeeId) {
      try {
        if (employeeId) {
          await Notification.create({
            userId: employeeId,
            senderId: employeeId,
            title: `Task Assigned to You`,
            body: `You have been assigned a new task: ${projectDetails?.projectId?.projectName}. Click to view the details and get started`,
            type: "system",
            read: false,
            visibleOnHome: true,
            actionUrl: `/workallocation?id=${allocationForProject._id}`,
            recordId: allocationForProject._id,
            userType: "employee",
          });
        }
      } catch (error) {
        console.error(`Error processing employeeId  ${employeeId}:`, error);
      }
    }
  },
  sendNotificationToAllEmp: async taskNameDetails => {
    for (const employeeId of taskNameDetails.employeeId) {
      try {
        if (employeeId) {
          await Notification.create({
            userId: employeeId,
            senderId: employeeId,
            title: `New Comment on Task`,
            body: `You have received a new comment on the task ${taskNameDetails?.taskName} Click to view and respond.`,
            type: "system",
            read: false,
            visibleOnHome: true,
            actionUrl: `/workallocation?id=${taskNameDetails._id}`,
            recordId: taskNameDetails._id,
            userType: "employee",
          });
        }
      } catch (error) {
        console.error(`Error processing employeeId  ${employeeId}:`, error);
      }
    }
  },
  createdTimesheet: async (req, res, next) => {
    try {
      const rawBody = req.body;
      const entries = Array.isArray(rawBody?.entries) ? rawBody.entries : Array.isArray(rawBody) ? rawBody : [rawBody];

      let userId = req.session.userId;
      let managerId = null;
      let organizationId = req.session.organizationId;

      const reportedToId = await User.findById(userId);
      const createdTimesheets = [];
      const batchMinutesByProject = new Map();

      for (let entry of entries) {
        let createObj = { ...(entry || {}) };

        if (!UtilController.isEmpty(organizationId)) {
          delete createObj.organizationId;
          createObj["organizationId"] = organizationId;
        }
        if (UtilController.isEmpty(createObj.managerId)) {
          if (!UtilController.isEmpty(reportedToId)) {
            managerId = await User.findOne({
              employeeId: reportedToId?.reportedTo,
              active: true,
            }).select("_id");
            createObj["managerId"] = [managerId?._id];
          }
        }
        if (!UtilController.isEmpty(entry.managerId)) {
          if (entry.managerId && Array.isArray(entry.managerId)) {
            createObj["managerId"] = entry.managerId;
          }
        }
        createObj["createdAt"] = Math.floor(Date.now() / 1000);
        createObj["employeeId"] = req.session.userId;
        createObj["updatedAt"] = Math.floor(Date.now() / 1000);
        createObj["status"] = "pending";
        createObj["updatedBy"] = req.session.userId;
        createObj["operatedBy"] = req.session.userId;
        if (UtilController.isEmpty(entry.subActivityId)) {
          delete createObj.subActivityId;
        }

        if (createObj.domains && Array.isArray(createObj.domains)) {
          createObj["domains"] = createObj.domains;
        }

        if (createObj.domainNames && Array.isArray(createObj.domainNames)) {
          createObj["domainNames"] = createObj.domainNames;
        }

        if (createObj.domain && !Array.isArray(createObj.domain)) {
          delete createObj.domain;
        }

        const requiredFields = ["employeeId", "activity", "startDateTime", "endDateTime", "workDescription"];
        const validationErrors = UtilController.validateRequiredFields(createObj, requiredFields);

        if (validationErrors.length > 0) {
          return UtilController.sendError(req, res, next, {
            message: "Validation errors occurred.",
            errors: validationErrors,
          });
        }

        if (createObj.duration) {
          const normalizedDuration = module.exports.validateAndNormalizeDuration(createObj.duration);
          if (normalizedDuration === null) {
            return UtilController.sendError(req, res, next, {
              message: "Validation error",
              errors: {
                duration: "Invalid duration format. Use: '8 hr : 30 min', '8hr', '8:30', or '8'",
              },
            });
          }
          const durationInMinutes = module.exports.parseDurationToMinutes(normalizedDuration);
          const maxDurationInMinutes = 20 * 60; // 20 hours
          if (durationInMinutes > maxDurationInMinutes) {
            return UtilController.sendError(req, res, next, {
              message: "Validation error",
              errors: {
                duration: "Maximum 20 hours allowed per timesheet entry",
              },
            });
          }

          createObj.duration = normalizedDuration;
        }

        if (createObj.breakHour) {
          const normalizedBreak = module.exports.validateAndNormalizeDuration(createObj.breakHour);
          if (normalizedBreak === null) {
            return UtilController.sendError(req, res, next, {
              message: "Invalid break hour format. Please use format like '1 hr : 0 min', '1hr', '1:00', or '1'.",
            });
          }
          createObj.breakHour = normalizedBreak;
        }

        if (createObj.ot) {
          const normalizedOt = module.exports.validateAndNormalizeDuration(createObj.ot);
          if (normalizedOt === null) {
            return UtilController.sendError(req, res, next, {
              message: "Invalid overtime format. Please use format like '1 hr : 30 min', '1hr', '1:30', or '1'.",
            });
          }
          createObj.ot = normalizedOt;
        }

        const entryDurationMinutes = createObj.duration
          ? module.exports.parseDurationToMinutes(createObj.duration)
          : 0;
        const projectKey = createObj.projectId ? String(createObj.projectId) : "";
        const batchExtra = projectKey ? batchMinutesByProject.get(projectKey) || 0 : 0;
        const projectHoursErrors = await validateProjectTimesheetHoursBudget({
          employeeId: req.session.userId,
          projectId: createObj.projectId,
          entryDurationMinutes,
          batchExtraMinutes: batchExtra,
          excludeTimesheetId: null,
          startDateTime: createObj.startDateTime,
          endDateTime: createObj.endDateTime,
        });
        if (projectHoursErrors) {
          return UtilController.sendError(req, res, next, {
            message: "Validation error",
            errors: projectHoursErrors,
          });
        }
        if (projectKey) {
          batchMinutesByProject.set(projectKey, batchExtra + entryDurationMinutes);
        }

        const existingTimesheet = await TimeSheet.findOne({
          employeeId: req.session.userId,
          active: true,
          $or: [
            {
              startDateTime: { $lt: createObj.endDateTime },
              endDateTime: { $gt: createObj.startDateTime },
            },
            {
              startDateTime: { $gte: createObj.startDateTime, $lt: createObj.endDateTime },
            },
            {
              endDateTime: { $gt: createObj.startDateTime, $lte: createObj.endDateTime },
            },
          ],
        });

        // if (existingTimesheet) {
        //   return UtilController.sendSuccess(req, res, next, {
        //     message: "Timesheet already exists for time period.",
        //     responseCode: returnCode.noPermission,
        //   });
        // }

        let tagResult = await Tag.findOneAndUpdate(
          {
            active: true,
            tagType: "timesheet",
          },
          {
            $inc: { sequenceNo: 1 },
            updatedAt: Math.floor(Date.now() / 1000),
          },
        );

        createObj["tagId"] = tagResult.prefix + UtilController.pad(tagResult.sequenceNo, 5);

        const createdTimesheet = await TimeSheet.create(createObj);
        createdTimesheets.push(createdTimesheet);

        let employeeDetails = await TimeSheet.findById(createdTimesheet?._id).populate("employeeId");
        // for organization
        await Notification.create({
          userType: "organizationAdmin",
          recordId: createdTimesheet?._id,
          userId: createdTimesheet?.organizationId,
          organizationId: createdTimesheet?.organizationId,
          title: `Timesheet Approval pending`,
          body: `Employee ${employeeDetails?.employeeId?.fname} ${employeeDetails?.employeeId?.lname} has submitted their timesheet for approval. Review and approve it now.`,
          type: "system",
          read: false,
          visibleOnHome: true,
          actionUrl: `/timesheet?id=${createdTimesheet._id}`,
        });
        //for manager
        await Notification.create({
          userType: "manager",
          recordId: createdTimesheet?._id,
          userId: managerId?._id,
          organizationId: createdTimesheet?.organizationId,
          title: `Timesheet Approval pending`,
          body: `Employee ${employeeDetails?.employeeId?.fname} ${employeeDetails?.employeeId?.lname}  has submitted their timesheet for approval. Review and approve it now.`,
          type: "system",
          read: false,
          visibleOnHome: true,
          actionUrl: `/timesheet?id=${createdTimesheet._id}`,
        });
        //below notification for employee
        await Notification.create({
          userType: "employee",
          recordId: createdTimesheet?._id,
          userId: createdTimesheet?.employeeId,
          organizationId: createdTimesheet?.organizationId,
          title: `Timesheet Submitted for Approval`,
          body: `Your timesheet has been submitted for approval. You’ll be notified once it’s reviewed`,
          type: "system",
          read: false,
          visibleOnHome: true,
          actionUrl: `/timesheet?id=${createdTimesheet._id}`,
        });
      }

      UtilController.sendSuccess(req, res, next, { createdTimesheets });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },
  checkWorkAllocationExists: async (req, res, next) => {
    try {
      // also checking below that whether do we have any record present for same activity,and timeslots if yes we wont allow user to create timesheet and we will throw the respnse work allocattion datra
      let queryObj = {
        employeeId: { $in: [mongoose.Types.ObjectId(req.session.userId)] },
        activity: mongoose.Types.ObjectId(req.body.activity),
        $or: [
          { startDateTime: { $lt: req.body.endDateTime }, endDateTime: { $gt: req.body.startDateTime } },
          { startDateTime: { $gte: req.body.startDateTime, $lt: req.body.endDateTime } },
          { endDateTime: { $gt: req.body.startDateTime, $lte: req.body.endDateTime } },
        ],
      };
      if (!UtilController.isEmpty(req.body.subActivityId)) {
        // if subactivity is present then we will check for subactivity
        queryObj["subActivityId"] = mongoose.Types.ObjectId(req.body.subActivityId);
      }

      const isWorkAllocationExists = await WorkAllocations.findOne(queryObj)
        .populate({
          path: "projectId",
          select: "projectName",
        })
        .populate({
          path: "organizationId",
          select: "organizationName",
        });

      if (isWorkAllocationExists) {
        return UtilController.sendSuccess(req, res, next, {
          message: "Work Allocation already exists for the given time period.",
          result: isWorkAllocationExists, // return the existing work allocation
          responseCode: returnCode.noPermission,
        });
      } else {
        UtilController.sendSuccess(req, res, next, {
          responseCode: returnCode.validSession,
          message: "No work allocation exists for the given time period",
        });
      }
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },
  getTimesheetDetailsById: async (req, res, next) => {
    try {
      let recordId = req.body.recordId;
      if (UtilController.isEmpty(recordId)) {
        UtilController.sendError(req, res, next, "Record Id is required");
        return;
      }
      const timesheets = await TimeSheet.findById(recordId)
        .populate({
          path: "employeeId",
          select: "fname lname mobileNo email",
        })
        .populate({
          path: "activity",
          select: "name description domains",
        })
        .populate({
          path: "subActivityId",
          select: "name description domains",
        })

        .populate({
          path: "managerId",
          select: "fname lname email profileImage",
        })
        .populate({
          path: "organizationId",
          select: "organizationName",
        })
        .populate({
          path: "projectId",
          select: "projectName projectTagId startDate endDate projectHead estimatedHours projectHours",
          populate: [
            {
              path: "projectHead",
              select: "fname lname email",
            },
            {
              path: "organizationId",
              select: "organizationName branchName",
            },
          ],
        })
        .populate({
          path: "createdBy",
          select: "fname lname email profileImage",
        })
        .populate({
          path: "updatedBy",
          select: "fname lname email profileImage",
        });

      if (timesheets) {
        if (timesheets.domain && !timesheets.domains) {
          timesheets.domains = [timesheets.domain];
        }
      }

      const timesheetLogs = await TimesheetLogs.find({ timeSheetId: recordId })
        .populate("operatedBy")
        .populate("timeSheetId")
        .populate("workAllocationId")
        .populate({
          path: "changes.operatedBy",
          select: "fname lname email profileImage",
        })
        .populate({
          path: "changes.projectId",
          select: "projectName",
        })
        .populate({
          path: "changes.activity",
          select: "activityName",
        });

      //to give specific response from work allocation
      let workAllocationMembersDetails = await WorkAllocations.findById(timesheets.workAllocationId)
        .populate({
          path: "timesheetRefIds",
          select: "employeeId status workDescription startDateTime endDateTime taskType",
          populate: {
            path: "employeeId",
            select: "fname lname email mobileNo profileImage",
          },
        })
        .populate({
          path: "projectId",
          select: "projectName projectTagId",
        })
        .populate({
          path: "organizationId",
          select: "organizationName branchName",
        })
        .populate({
          path: "managerId",
          select: "fname lname mobileNo profileImage employeeId",
        })
        .populate({
          path: "activity",
          select: "name domains",
        });
      timesheets.workAllocationId = workAllocationMembersDetails;

      let response = {
        timesheets,
        timesheetLogs,
      };

      UtilController.sendSuccess(req, res, next, { result: response });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },
  updateTimeSheet: async (req, res, next) => {
    try {
      let updateObj = req.body;
      let updateRecordId = req.body.recordId;
      delete updateObj?.recordId;
      if (UtilController.isEmpty(updateRecordId)) {
        UtilController.sendError(req, res, next, "Record Id is required");
        return;
      }

      const existingDoc = await TimeSheet.findById(updateRecordId)
        .select("employeeId projectId duration startDateTime endDateTime")
        .lean();
      if (!existingDoc) {
        UtilController.sendError(req, res, next, "Timesheet not found");
        return;
      }

      if (updateObj.domains && Array.isArray(updateObj.domains)) {
        updateObj["domains"] = updateObj.domains;
      }

      if (updateObj.domainNames && Array.isArray(updateObj.domainNames)) {
        updateObj["domainNames"] = updateObj.domainNames;
      }

      if (updateObj.domain && !Array.isArray(updateObj.domain)) {
        delete updateObj.domain;
      }

      const requiredFields = ["employeeId", "activity", "startDateTime", "endDateTime", "workDescription"];
      const validationErrors = UtilController.validateRequiredFields(updateObj, requiredFields);

      if (validationErrors.length > 0) {
        return UtilController.sendError(req, res, next, {
          message: "Validation errors occurred.",
          errors: validationErrors,
        });
      }

      if (updateObj.duration) {
        const normalizedDuration = module.exports.validateAndNormalizeDuration(updateObj.duration);
        if (normalizedDuration === null) {
          return UtilController.sendError(req, res, next, {
            message: "Invalid duration format. Please use format like '8 hr : 30 min', '8hr', '8:30', or '8'.",
          });
        }
        const durationInMinutes = module.exports.parseDurationToMinutes(normalizedDuration);
        const maxDurationInMinutes = 20 * 60; // 20 hours
        if (durationInMinutes > maxDurationInMinutes) {
          return UtilController.sendError(req, res, next, {
            message: "Validation error",
            errors: {
              duration: "Maximum 20 hours allowed per timesheet entry",
            },
          });
        }
        updateObj.duration = normalizedDuration;
      }

      if (updateObj.breakHour) {
        const normalizedBreak = module.exports.validateAndNormalizeDuration(updateObj.breakHour);
        if (normalizedBreak === null) {
          return UtilController.sendError(req, res, next, {
            message: "Invalid break hour format. Please use format like '1 hr : 0 min', '1hr', '1:00', or '1'.",
          });
        }
        updateObj.breakHour = normalizedBreak;
      }

      if (updateObj.ot) {
        const normalizedOt = module.exports.validateAndNormalizeDuration(updateObj.ot);
        if (normalizedOt === null) {
          return UtilController.sendError(req, res, next, {
            message: "Invalid overtime format. Please use format like '1 hr : 30 min', '1hr', '1:30', or '1'.",
          });
        }
        updateObj.ot = normalizedOt;
      }

      const durationForBudget =
        updateObj.duration != null && updateObj.duration !== ""
          ? updateObj.duration
          : existingDoc.duration;
      const normBudget = durationForBudget
        ? module.exports.validateAndNormalizeDuration(String(durationForBudget))
        : null;
      const entryDurationMinutes = normBudget ? module.exports.parseDurationToMinutes(normBudget) : 0;
      const employeeIdForBudget = updateObj.employeeId || existingDoc.employeeId;
      const projectIdForBudget = updateObj.projectId || existingDoc.projectId;
      const startForBudget =
        updateObj.startDateTime != null ? updateObj.startDateTime : existingDoc.startDateTime;
      const endForBudget = updateObj.endDateTime != null ? updateObj.endDateTime : existingDoc.endDateTime;

      const projectHoursErrorsUpdate = await validateProjectTimesheetHoursBudget({
        employeeId: employeeIdForBudget,
        projectId: projectIdForBudget,
        entryDurationMinutes,
        batchExtraMinutes: 0,
        excludeTimesheetId: updateRecordId,
        startDateTime: startForBudget,
        endDateTime: endForBudget,
      });
      if (projectHoursErrorsUpdate) {
        return UtilController.sendError(req, res, next, {
          message: "Validation error",
          errors: projectHoursErrorsUpdate,
        });
      }

      updateObj["operatedBy"] = req.session.userId;
      updateObj["updatedAt"] = Math.floor(Date.now() / 1000);
      updateObj["updatedBy"] = req.session.userId;

      //user can only update if the status is rejected so, if update is called change the status to pending
      updateObj["status"] = "pending";

      //manage the logs in the timesheet logs
      let logObj = {
        timeSheetId: updateRecordId,
        action: "Updated",
        operatedBy: req.session.userId,
        changes: updateObj,
      };
      await TimesheetLogs.create(logObj);
      const updatedResponse = await TimeSheet.findByIdAndUpdate(updateRecordId, updateObj, {
        new: true,
      });
      const updateUserObj = {
        startDateTime: updateObj.startDateTime,
        endDateTime: updateObj.endDateTime,
        workDescription: updateObj.workDescription,
        taskStatus: updateObj.taskStatus,
        duration: updateObj.duration,
      };

      // Update the specific user object in the employeeId array

      const updateWorkAllocationForUser = await TimeSheet.findByIdAndUpdate(updateRecordId, updateObj, {
        new: true,
      });

      UtilController.sendSuccess(req, res, next, {
        responseCode: returnCode.validSession,
        message: "Time Sheet updated successfully",
      });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },
  deleteTimesheet: async (req, res, next) => {
    try {
      let recordId = req.body.recordId;
      if (UtilController.isEmpty(recordId)) {
        UtilController.sendError(req, res, next, "Record Id is required");
        return;
      }
      await TimeSheet.findByIdAndUpdate(recordId, { active: false }, { new: true });
      UtilController.sendSuccess(req, res, next, {
        responseCode: returnCode.validSession,
        message: "Time Sheet deleted successfully",
      });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },

  //below we'll also write the logs for timesheet submission,rejection and approval

  // listAllTimeSheetData: async (req, res, next) => {
  //   try {
  //     // Apply search, sort, and pagination
  //     let search = {};
  //     let assignedMember = req.body.assignedMember;
  //     let userId = req.session.userId;
  //     let userType = req.session.userType;
  //     let isSuperAdmin = req.session.isSuperAdmin;
  //     let organizationId = req.session.organizationId;
  //     let taskStatus = req.body.taskStatus;
  //     let priority = req.body.taskPriority;
  //     let createdAt = req.body.createdAt;
  //     let updatedAt = req.body.updatedAt;
  //     let approval = req.body.approval;

  //     if (!UtilController.isEmpty(req.body.keyword)) {
  //       const keyword = req.body.keyword;
  //       search["$or"] = [
  //         { tagId: { $regex: keyword, $options: "i" } },
  //         { domain: { $regex: keyword, $options: "i" } },
  //         { workDescription: { $regex: keyword, $options: "i" } },
  //         {
  //           $expr: {
  //             $regexMatch: {
  //               input: { $arrayElemAt: ["$projectId.projectName", 0] },
  //               regex: keyword,
  //               options: "i",
  //             },
  //           },
  //         },
  //         {
  //           $expr: {
  //             $regexMatch: {
  //               input: { $arrayElemAt: ["$organizationId.organizationName", 0] },
  //               regex: keyword,
  //               options: "i",
  //             },
  //           },
  //         },
  //         {
  //           $expr: {
  //             $regexMatch: {
  //               input: {
  //                 $concat: [
  //                   { $arrayElemAt: ["$employeeId.fname", 0] },
  //                   " ",
  //                   { $arrayElemAt: ["$employeeId.lname", 0] },
  //                 ],
  //               },
  //               regex: keyword,
  //               options: "i",
  //             },
  //           },
  //         },
  //       ];
  //     }

  //     let match = {
  //       active: true,
  //     };
  //     if (!UtilController.isEmpty(req.body.active)) {
  //       match["active"] = req.body.active;
  //     }
  //     if (!UtilController.isEmpty(userId) && !isSuperAdmin && userType?.toLowerCase() === "employee") {
  //       match["employeeId"] = new mongoose.Types.ObjectId(userId);
  //       match["organizationId"] = new mongoose.Types.ObjectId(organizationId);
  //     }
  //     if (!UtilController.isEmpty(userId) && !isSuperAdmin && userType?.toLowerCase() === "manager") {
  //       match["managerId"] = new mongoose.Types.ObjectId(userId);
  //       match["organizationId"] = new mongoose.Types.ObjectId(organizationId);
  //     }
  //     if (!UtilController.isEmpty(userId) && !isSuperAdmin && userType?.toLowerCase() === "organization admin") {
  //       match["organizationId"] = new mongoose.Types.ObjectId(organizationId);
  //     }

  //     if (!UtilController.isEmpty(taskStatus)) {
  //       match["taskStatus"] = taskStatus;
  //     }
  //     if (!UtilController.isEmpty(priority)) {
  //       match["priority"] = priority;
  //     }
  //     if (!UtilController.isEmpty(createdAt)) {
  //       match["createdAt"] = createdAt;
  //     }
  //     if (!UtilController.isEmpty(updatedAt)) {
  //       match["updatedAt"] = updatedAt;
  //     }
  //     if (!UtilController.isEmpty(approval)) {
  //       match["managerId"] = new mongoose.Types.ObjectId(approval);
  //     }
  //     if (!UtilController.isEmpty(req.body.organizationId)) {
  //       match["organizationId"] = new mongoose.Types.ObjectId(req.body.organizationId);
  //     }
  //     let sort = {};
  //     if (!UtilController.isEmpty(req.body.sortField) && !UtilController.isEmpty(req.body.sortOrder)) {
  //       let sortField = req.body.sortField;
  //       let sortOrder = req.body.sortOrder;
  //       sort[sortField] = sortOrder;
  //     } else {
  //       sort = { updatedAt: -1 };
  //     }
  //     console.log(JSON.stringify(match));
  //     let pageSize = 10;
  //     let page = 0;
  //     if (!UtilController.isEmpty(req.body.pageSize)) pageSize = req.body.pageSize;
  //     if (!UtilController.isEmpty(req.body.page)) page = req.body.page;
  //     let pipeline = [
  //       { $match: match },
  //       //do the lookup for employeeId,projectId,operatedBy,createdBy,organizationId,activity,subActivity

  //       {
  //         $lookup: {
  //           from: "users",
  //           localField: "employeeId",
  //           foreignField: "_id",
  //           as: "employeeId",
  //         },
  //       },
  //       {
  //         $lookup: {
  //           from: "projects",
  //           localField: "projectId",
  //           foreignField: "_id",
  //           as: "projectId",
  //         },
  //       },
  //       {
  //         $lookup: {
  //           from: "users",
  //           localField: "operatedBy",
  //           foreignField: "_id",
  //           as: "operatedBy",
  //         },
  //       },
  //       {
  //         $lookup: {
  //           from: "users",
  //           localField: "updatedBy",
  //           foreignField: "_id",
  //           as: "updatedBy",
  //         },
  //       },
  //       {
  //         $lookup: {
  //           from: "users",
  //           localField: "createdBy",
  //           foreignField: "_id",
  //           as: "createdBy",
  //         },
  //       },
  //       {
  //         $lookup: {
  //           from: "organizations",
  //           localField: "organizationId",
  //           foreignField: "_id",
  //           as: "organizationId",
  //         },
  //       },
  //       {
  //         $lookup: {
  //           from: "activities",
  //           localField: "activity",
  //           foreignField: "_id",
  //           as: "activity",
  //         },
  //       },
  //       {
  //         $lookup: {
  //           from: "activities",
  //           localField: "subActivityId",
  //           foreignField: "_id",
  //           as: "subActivityId",
  //         },
  //       },
  //       {
  //         $lookup: {
  //           from: "users",
  //           localField: "managerId",
  //           foreignField: "_id",
  //           as: "managerId",
  //         },
  //       },
  //       {
  //         $lookup: {
  //           from: "users",
  //           localField: "projectHead",
  //           foreignField: "_id",
  //           as: "projectHead",
  //         },
  //       },

  //       { $match: search },
  //       {
  //         $facet: {
  //           totalCount: [{ $count: "count" }],
  //           data: [{ $sort: sort }, { $skip: page * pageSize }, { $limit: pageSize }],
  //         },
  //       },
  //     ];

  //     const timeSheetData = await TimeSheet.aggregate(pipeline);

  //     const totalCount = timeSheetData[0].totalCount[0] ? timeSheetData[0].totalCount[0].count : 0;
  //     const rows = timeSheetData[0].data;
  //     const pages = Math.ceil(totalCount / pageSize);

  //     UtilController.sendSuccess(req, res, next, {
  //       result: rows,
  //       filterRecords: totalCount,
  //       pages: pages,
  //     });
  //   } catch (err) {
  //     UtilController.sendError(req, res, next, err);
  //   }
  // },
  listAllTimeSheetData: async (req, res, next) => {
    try {
      let search = {};
      let assignedMember = req.body.assignedMember;
      let startDate = req.body.startDate;
      let endDate = req.body.endDate;
      let timesheetStartDateTime = req.body.timesheetStartDateTime;
      let timesheetEndDateTime = req.body.timesheetEndDateTime;
      let userId = req.session.userId; // Logged-in user ID
      let userType = req.session.userType; // User type: employee/manager/admin
      let isSuperAdmin = req.session.isSuperAdmin; // Boolean flag for super admin
      let organizationId = req.session.organizationId; // Logged-in user's organization
      let taskStatus = req.body.taskStatus;
      let priority = req.body.taskPriority;
      let createdAt = req.body.createdAt;
      let updatedAt = req.body.updatedAt;
      let approval = req.body.approval;

      // Keyword search logic
      if (!UtilController.isEmpty(req.body.keyword)) {
        const keyword = req.body.keyword;
        search["$or"] = [
          { tagId: { $regex: keyword, $options: "i" } },
          { domains: { $elemMatch: { $regex: keyword, $options: "i" } } },
          { domainNames: { $elemMatch: { $regex: keyword, $options: "i" } } },
          { workDescription: { $regex: keyword, $options: "i" } },
          {
            $expr: {
              $regexMatch: {
                input: { $arrayElemAt: ["$projectId.projectName", 0] },
                regex: keyword,
                options: "i",
              },
            },
          },
          {
            $expr: {
              $regexMatch: {
                input: { $arrayElemAt: ["$organizationId.organizationName", 0] },
                regex: keyword,
                options: "i",
              },
            },
          },
          {
            employeeName: {
              $regex: keyword,
              $options: "i",
            },
          },
        ];
      }

      // Match conditions to restrict data visibility
      let match = {
        active: true, // Only active entries
      };
      if (!UtilController.isEmpty(organizationId)) {
        match["organizationId"] = mongoose.Types.ObjectId(organizationId);
      }

      if (!UtilController.isEmpty(userId) && !isSuperAdmin) {
        if (userType?.toLowerCase() === "employee") {
          match["employeeId"] = new mongoose.Types.ObjectId(userId); // Employee can see their own records
        } else if (userType?.toLowerCase() === "manager" || userType?.toLowerCase() === "tls") {
          // Manager/TLS can see their team's records (where they are the manager)
          if (Array.isArray(userId)) {
            match["managerId"] = { $in: userId.map(id => new mongoose.Types.ObjectId(id)) }; // Manager/TLS can see their team's records
          } else {
            match["managerId"] = new mongoose.Types.ObjectId(userId); // Single manager/TLS ID
          }
        } else if (userType?.toLowerCase() === "organization admin") {
          match["organizationId"] = new mongoose.Types.ObjectId(organizationId); // Admin can see records for their organization
        }
      }

      if (!UtilController.isEmpty(taskStatus)) {
        match["taskStatus"] = taskStatus;
      }
      if (!UtilController.isEmpty(priority)) {
        match["priority"] = priority;
      }
      if (!UtilController.isEmpty(createdAt)) {
        match["createdAt"] = createdAt;
      }
      if (!UtilController.isEmpty(updatedAt)) {
        match["updatedAt"] = updatedAt;
      }
      if (!UtilController.isEmpty(approval)) {
        if (Array.isArray(approval)) {
          match["managerId"] = { $in: approval.map(id => new mongoose.Types.ObjectId(id)) };
        } else {
          match["managerId"] = new mongoose.Types.ObjectId(approval);
        }
      }

      if (!UtilController.isEmpty(req.body.organizationId)) {
        match["organizationId"] = new mongoose.Types.ObjectId(req.body.organizationId);
      }
      if (!UtilController.isEmpty(req.body.status)) {
        match["status"] = { $regex: req.body.status, $options: "i" };
      }

      let sort = {};
      if (!UtilController.isEmpty(req.body.sortField) && !UtilController.isEmpty(req.body.sortOrder)) {
        sort[req.body.sortField] = req.body.sortOrder;
      } else {
        sort = { updatedAt: -1 };
      }
      if (!UtilController.isEmpty(startDate) && !UtilController.isEmpty(endDate)) {
        match["$and"] = [{ createdAt: { $gte: parseInt(startDate) } }, { createdAt: { $lte: parseInt(endDate) } }];
      }
      if (!UtilController.isEmpty(timesheetStartDateTime) && !UtilController.isEmpty(timesheetEndDateTime)) {
        const startTs = parseInt(timesheetStartDateTime);
        const endTs = parseInt(timesheetEndDateTime);
        if (Array.isArray(match["$and"])) {
          match["$and"].push({ startDateTime: { $gte: startTs } }, { startDateTime: { $lte: endTs } });
        } else {
          match["$and"] = [{ startDateTime: { $gte: startTs } }, { startDateTime: { $lte: endTs } }];
        }
      }
      let pageSize = req.body.pageSize || 10;
      let page = req.body.page || 0;

      // MongoDB aggregation pipeline
      let pipeline = [
        { $match: match },
        {
          $lookup: {
            from: "users",
            localField: "employeeId",
            foreignField: "_id",
            as: "employeeDetails",
          },
        },
        { $unwind: { path: "$employeeDetails", preserveNullAndEmptyArrays: true } },

        {
          $lookup: {
            from: "departments",
            let: { deptId: "$employeeDetails.departmentId" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: ["$departmentId", "$$deptId"], // Match departmentId string field
                  },
                },
              },
            ],
            as: "departmentDetails",
          },
        },
        { $unwind: { path: "$departmentDetails", preserveNullAndEmptyArrays: true } },

        {
          $addFields: {
            employeeName: {
              $concat: [{ $ifNull: ["$employeeDetails.fname", ""] }, " ", { $ifNull: ["$employeeDetails.lname", ""] }],
            },
            employeePosition: "$employeeDetails.position",
            employeeDepartment: "$departmentDetails.name",
            employeeDepartmentId: "$departmentDetails.departmentId",
          },
        },
        { $match: search },

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
            from: "users",
            localField: "project.projectHead",
            foreignField: "_id",
            as: "projectHeadDetails",
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
            from: "activities",
            localField: "activity",
            foreignField: "_id",
            as: "activityDetails",
          },
        },
        { $unwind: { path: "$activityDetails", preserveNullAndEmptyArrays: true } },
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
            from: "workallocations",
            localField: "workAllocationId",
            foreignField: "_id",
            as: "workAllocationDetails",
          },
        },
        {
          $project: {
            submittedAt: 1,
            taskStatus: 1,
            domains: 1,
            domainNames: 1,
            breakHour: 1,
            ot: 1,
            status: 1,
            rejectionReason: 1,
            createdAt: 1,
            updatedAt: 1,
            startDateTime: 1,
            endDateTime: 1,
            duration: 1,
            workDescription: 1,
            quantity: 1,
            employeeName: {
              $concat: [{ $ifNull: ["$employeeDetails.fname", ""] }, " ", { $ifNull: ["$employeeDetails.lname", ""] }],
            },
            employeePosition: 1,
            employeeDepartment: 1,
            employeeDepartmentId: 1,
            managerDetails: "$managerDetails",
            projectHead: "$projectHeadDetails",
            projectName: "$project.projectName",
            projectStatus: "$project.projectStatus",
            estimatedHours: "$project.estimatedHours",
            projectHours: "$project.projectHours",
            activityName: "$activityDetails.name",
            subActivityName: "$subActivity.name",
            workAllocationDetails: 1,
            assignedDuration: { $arrayElemAt: ["$workAllocationDetails.duration", 0] }, // need for conversion
          },
        },
        /* convert workAllocationDetails.duration and duration field eg:"8 hr : 0 min" into minutes. if workAllocationDetails.duration > duration add field isDurationGreater: true else false/null  */
        {
          $addFields: {
            assignedDuration: {
              $cond: {
                if: {
                  $and: [
                    { $ne: ["$assignedDuration", null] },
                    { $ne: ["$assignedDuration", ""] },
                    {
                      $regexMatch: {
                        input: { $toString: "$assignedDuration" },
                        regex: " hr",
                      },
                    },
                  ],
                },
                then: {
                  $let: {
                    vars: {
                      hoursPart: { $arrayElemAt: [{ $split: ["$assignedDuration", " hr"] }, 0] },
                      minutesPart: {
                        $arrayElemAt: [
                          { $split: [{ $arrayElemAt: [{ $split: ["$assignedDuration", ": "] }, 1] }, " min"] },
                          0,
                        ],
                      },
                    },
                    in: {
                      $add: [
                        { $multiply: [{ $toInt: { $ifNull: ["$$hoursPart", 0] } }, 60] },
                        { $toInt: { $ifNull: ["$$minutesPart", 0] } },
                      ],
                    },
                  },
                },
                else: 0,
              },
            },
            employeeDuration: {
              $cond: {
                if: {
                  $and: [
                    { $ne: ["$duration", null] },
                    { $ne: ["$duration", ""] },
                    {
                      $regexMatch: {
                        input: { $toString: "$duration" },
                        regex: " hr",
                      },
                    },
                  ],
                },
                then: {
                  $let: {
                    vars: {
                      hoursPart: { $arrayElemAt: [{ $split: ["$duration", " hr"] }, 0] },
                      minutesPart: {
                        $arrayElemAt: [{ $split: [{ $arrayElemAt: [{ $split: ["$duration", ": "] }, 1] }, " min"] }, 0],
                      },
                    },
                    in: {
                      $add: [
                        { $multiply: [{ $toInt: { $ifNull: ["$$hoursPart", 0] } }, 60] },
                        { $toInt: { $ifNull: ["$$minutesPart", 0] } },
                      ],
                    },
                  },
                },
                else: 0,
              },
            },
          },
        },
        {
          $addFields: {
            isDurationGreater: {
              $cond: {
                if: {
                  $and: [{ $ne: ["$assignedDuration", null] }, { $ne: ["$employeeDuration", null] }],
                },
                then: { $gt: ["$employeeDuration", "$assignedDuration"] },
                else: null,
              },
            },
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

      // Execute pipeline
      const timeSheetData = await TimeSheet.aggregate(pipeline);

      const totalCount = timeSheetData[0].totalCount[0] ? timeSheetData[0].totalCount[0].count : 0;
      const rows = timeSheetData[0].data;
      const pages = Math.ceil(totalCount / pageSize);

      UtilController.sendSuccess(req, res, next, {
        result: rows,
        filterRecords: totalCount,
        pages: pages,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },

  listPendingTimeSheet: async (req, res, next) => {
    try {
      let search = {};
      let assignedMember = req.body.assignedMember;
      let startDate = req.body.startDate;
      let endDate = req.body.endDate;
      let userId = req.session.userId; // Logged-in user ID
      let userType = req.session.userType; // User type: employee/manager/admin
      let isSuperAdmin = req.session.isSuperAdmin; // Boolean flag for super admin
      let organizationId = req.session.organizationId; // Logged-in user's organization
      let taskStatus = req.body.taskStatus;
      let priority = req.body.taskPriority;
      let createdAt = req.body.createdAt;
      let updatedAt = req.body.updatedAt;
      let approval = req.body.approval;

      // Match conditions to restrict data visibility
      let match = {
        active: true, // Only active entries
        status: "pending", // Only pending timesheets
      };

      // Filter by userType to restrict data visibility
      if (!UtilController.isEmpty(userId) && !isSuperAdmin) {
        if (userType?.toLowerCase() === "employee") {
          match["employeeId"] = new mongoose.Types.ObjectId(userId); // Employee can see their own records
        } else if (userType?.toLowerCase() === "manager" || userType?.toLowerCase() === "tls") {
          // Manager/TLS can see their team's records (where they are the manager)
          if (Array.isArray(userId)) {
            match["managerId"] = { $in: userId.map(id => new mongoose.Types.ObjectId(id)) }; // Manager/TLS can see their team's records
          } else {
            match["managerId"] = new mongoose.Types.ObjectId(userId); // Single manager/TLS ID
          }
        } else if (userType?.toLowerCase() === "organization admin") {
          match["organizationId"] = new mongoose.Types.ObjectId(organizationId); // Admin can see records for their organization
        }
      }

      // Filter by approval parameter if provided
      if (!UtilController.isEmpty(approval)) {
        if (Array.isArray(approval)) {
          match["managerId"] = { $in: approval.map(id => new mongoose.Types.ObjectId(id)) };
        } else {
          match["managerId"] = new mongoose.Types.ObjectId(approval);
        }
      }

      let pageSize = req.body.pageSize || 100;
      let page = req.body.page || 1;

      // Execute pipeline
      const timeSheetData = await TimeSheet.aggregate([{ $match: match }]);
      // console.log("timeSheetData", timeSheetData);
      const totalCount = timeSheetData.length;
      const rows = timeSheetData;
      const pages = Math.ceil(totalCount / pageSize);

      UtilController.sendSuccess(req, res, next, {
        result: rows,
        filterRecords: totalCount,
        pages: pages,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },

  //below is the controller for changing the status of the timesheet
  changeStatus: async (req, res, next) => {
    try {
      let recordId = req.body.recordId;
      let status = req.body.status;
      let rejectionReason = req.body.reason ?? "";
      let approveReason = req.body.approveReason ?? "";
      if (UtilController.isEmpty(recordId)) {
        UtilController.sendError(req, res, next, "Record Id is required");
        return;
      }
      const result = await TimeSheet.findByIdAndUpdate(
        recordId,
        { status, rejectionReason, approveReason, submittedAt: Math.floor(Date.now() / 1000) },
        { new: true },
      ).populate("employeeId");

      if (status === "approved" && result.workAllocationId) {
        await WorkAllocations.findByIdAndUpdate(
          result.workAllocationId,
          {
            status: "completed",
            updatedAt: Math.floor(Date.now() / 1000),
            updatedBy: req.session.userId,
          },
          { new: true },
        );
      }

      await Notification.create({
        userType: "organizationAdmin",
        recordId: result?._id,
        userId: result?.organizationId,
        organizationId: result?.organizationId,
        title: `Timesheet Status Update`,
        body: `The employee timesheet has been ${result?.status}. Check your timesheet for details`,
        type: "system",
        read: false,
        visibleOnHome: true,
        actionUrl: `/timesheet?id=${result._id}`,
      });
      if (Array.isArray(result?.managerId)) {
        await Promise.all(
          result.managerId.map(managerId =>
            Notification.create({
              userType: "manager",
              recordId: result?._id,
              userId: managerId,
              organizationId: result?.organizationId,
              title: `Timesheet Status Update`,
              body: `The employee timesheet has been ${result?.status}. Check your timesheet for details`,
              type: "system",
              read: false,
              visibleOnHome: true,
              actionUrl: `/timesheet?id=${result._id}`,
            }),
          ),
        );
      } else if (result?.managerId) {
        await Notification.create({
          userType: "manager",
          recordId: result?._id,
          userId: result?.managerId,
          organizationId: result?.organizationId,
          title: `Timesheet Status Update`,
          body: `The employee timesheet has been ${result?.status}. Check your timesheet for details`,
          type: "system",
          read: false,
          visibleOnHome: true,
          actionUrl: `/timesheet?id=${result._id}`,
        });
      }

      //for employee
      await Notification.create({
        userType: "employee",
        recordId: result?._id,
        userId: result?.employeeId,
        organizationId: result?.organizationId,
        title: `Timesheet Status Update`,
        body: `Your timesheet has been ${result?.status}. Check your timesheet for details`,
        type: "system",
        read: false,
        visibleOnHome: true,
        actionUrl: `/timesheet?id=${result._id}`,
      });
      //manage the logs in the timesheet logs
      let logObj = {
        timeSheetId: recordId,
        action: status,
        rejectionReason,
        approveReason,
        operatedBy: req.session.userId,
      };
      await TimesheetLogs.create(logObj);
      UtilController.sendSuccess(req, res, next, {
        responseCode: returnCode.validSession,
        message: "Time Sheet submitted successfully",
      });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },
  //logs for tracking the timesheet status
  getTimesheetLogs: async (req, res, next) => {
    try {
      let recordId = req.body.recordId;
      if (UtilController.isEmpty(recordId)) {
        UtilController.sendError(req, res, next, "Record Id is required");
        return;
      }
      const timesheetLogs = await TimesheetLogs.find({ timeSheetId: recordId })
        .populate("operatedBy")
        .populate("timeSheetId");
      //if empty then return the message
      if (timesheetLogs.length === 0) {
        UtilController.sendSuccess(req, res, next, {
          responseCode: returnCode.validSession,
          message: "No logs found for this timesheet",
        });
        return;
      }
      UtilController.sendSuccess(req, res, next, { timesheetLogs });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },

  createProjectAllocation: async (req, res, next) => {
    try {
      const rawBody = req.body;
      const entries = Array.isArray(rawBody?.entries) ? rawBody.entries : Array.isArray(rawBody) ? rawBody : [rawBody];

      let userId = req.session.userId;

      let organizationId = req.session.organizationId;

      const createdAllocationForProjects = [];

      for (let entry of entries) {
        let createObj = { ...(entry || {}) };

        if (!UtilController.isEmpty(organizationId)) {
          delete createObj.organizationId;
          createObj["organizationId"] = organizationId;
        }
        if (createObj.activity) {
          const activityData = await Activity.findById({ _id: new mongoose.Types.ObjectId(createObj.activity) }).select("name");

          createObj["activityName"] = activityData ? activityData.name : "";
        }
        createObj["createdAt"] = Math.floor(Date.now() / 1000);
        createObj["updatedAt"] = Math.floor(Date.now() / 1000);
        createObj["status"] = "pending";
        createObj["updatedBy"] = req.session.userId;
        createObj["operatedBy"] = req.session.userId;
        createObj["createdBy"] = req.session.userId;

        const requiredFields = ["projectId", "managerId"];
        const validationErrors = UtilController.validateRequiredFields(createObj, requiredFields);

        if (validationErrors.length > 0) {
          return UtilController.sendError(req, res, next, {
            message: "Validation errors occurred.",
            errors: validationErrors,
          });
        }

        let tagResult = await Tag.findOneAndUpdate(
          {
            active: true,
            tagType: "allocation",
          },
          {
            $inc: { sequenceNo: 1 },
            updatedAt: Math.floor(Date.now() / 1000),
          },
        );

        createObj["tagId"] = tagResult.prefix + UtilController.pad(tagResult.sequenceNo, 5);

        const allocationForProject = await WorkAllocations.create(createObj);
        createdAllocationForProjects.push(allocationForProject);
        let projectDetails = await WorkAllocations.findById(allocationForProject._id).populate("projectId");
        //for organization
        await Notification.create({
          userType: "organizationAdmin",
          recordId: allocationForProject?._id,
          userId: req.session.userId,
          organizationId: allocationForProject?.organizationId,
          title: `Tasks Allocated to Employees`,
          body: `Tasks have been successfully allocated to employees. Click to review the task`,
          type: "system",
          read: false,
          visibleOnHome: true,
          actionUrl: `/workallocation?id=${allocationForProject._id}`,
        });
        await Notification.create({
          userType: "organizationAdmin",
          recordId: allocationForProject?._id,
          userId: req.session.userId,
          organizationId: allocationForProject?.organizationId,
          title: `Team Members Added`,
          body: `Team members, has been added to the project ${projectDetails?.projectId?.projectName} Welcome them onboard!`,
          type: "system",
          read: false,
          visibleOnHome: true,
          actionUrl: `/workallocation?id=${allocationForProject._id}`,
        });

        if (Array.isArray(allocationForProject?.managerId)) {
          // For "Team Members Added" notification
          await Promise.all(
            allocationForProject.managerId.map(managerId =>
              Notification.create({
                userType: "manager",
                recordId: allocationForProject?._id,
                userId: managerId,
                title: `Team Members Added`,
                body: `Team members have been added to the project ${projectDetails?.projectId?.projectName}. Welcome them onboard!`,
                type: "system",
                read: false,
                visibleOnHome: true,
                actionUrl: `/workallocation?id=${allocationForProject._id}`,
              }),
            ),
          );

          // For "Tasks Allocated to Employees" notification
          await Promise.all(
            allocationForProject.managerId.map(managerId =>
              Notification.create({
                userType: "manager",
                recordId: allocationForProject?._id,
                userId: managerId,
                title: `Tasks Allocated to Employees`,
                body: `Tasks have been successfully allocated to employees. Click to review the task.`,
                type: "system",
                read: false,
                visibleOnHome: true,
                actionUrl: `/workallocation?id=${allocationForProject._id}`,
              }),
            ),
          );
        } else {
          console.error("managerId is not an array");
        }

        //for sending notification to all employees
        await module.exports.helperFunctionForTaskAssign(allocationForProject, projectDetails);
      }

      UtilController.sendSuccess(req, res, next, { createdAllocationForProjects });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },

  //below controller are for comments for activity
  addActivityComment: async (req, res, next) => {
    try {
      const { activityId, content, mentions, attachments, workAllocationId } = req.body;
      const userId = req.session.userId;

      const requiredFields = ["workAllocationId", "content"];
      const validationErrors = UtilController.validateRequiredFields(req.body, requiredFields);
      if (validationErrors.length > 0) {
        return UtilController.sendError(req, res, next, {
          message: "Validation errors occurred.",
          errors: validationErrors,
        });
      }

      const comment = await AllocationComments.create({
        activity: new mongoose.Types.ObjectId(activityId),
        workAllocationId: new mongoose.Types.ObjectId(workAllocationId),
        content,
        createdBy: new mongoose.Types.ObjectId(userId),
        mentions,
        attachments,
        createdAt: Math.floor(Date.now() / 1000),
      });

      // Get task details
      let taskNameDetails = await WorkAllocations.findById(workAllocationId).select(
        "taskName organizationId employeeId managerId",
      );

      // Notify organization admin
      await Notification.create({
        userType: "organizationAdmin",
        recordId: taskNameDetails._id,
        userId: req.session.userId,
        organizationId: taskNameDetails?.organizationId,
        title: `New Comment on Task`,
        body: `You have received a new comment on the task ${taskNameDetails?.taskName} Click to view and respond`,
        type: "system",
        read: false,
        visibleOnHome: true,
        actionUrl: `/workallocation?id=${taskNameDetails._id}`,
      });

      // Notify manager
      if (Array.isArray(taskNameDetails?.managerId)) {
        await Promise.all(
          taskNameDetails.managerId.map(managerId =>
            Notification.create({
              userType: "manager",
              recordId: taskNameDetails._id,
              userId: managerId,
              title: `New Comment on Task`,
              body: `You have received a new comment on the task ${taskNameDetails?.taskName}. Click to view and respond.`,
              type: "system",
              read: false,
              visibleOnHome: true,
              actionUrl: `/workallocation?id=${taskNameDetails._id}`,
            }),
          ),
        );
      } else if (taskNameDetails?.managerId) {
        await Notification.create({
          userType: "manager",
          recordId: taskNameDetails._id,
          userId: taskNameDetails.managerId,
          title: `New Comment on Task`,
          body: `You have received a new comment on the task ${taskNameDetails?.taskName}. Click to view and respond.`,
          type: "system",
          read: false,
          visibleOnHome: true,
          actionUrl: `/workallocation?id=${taskNameDetails._id}`,
        });
      }

      // Notify all employees
      await module.exports.sendNotificationToAllEmp(taskNameDetails);

      // Notify mentioned users
      if (mentions && mentions.length > 0) {
        await Promise.all(
          mentions.map(async mentionId => {
            const mentionedUser = await User.findById(mentionId).select("userType fname");
            if (mentionedUser) {
              let notificationMessage = "";

              let notificationData = {
                userId: mongoose.Types.ObjectId(mentionId),
                senderId: mongoose.Types.ObjectId(userId),
                subject: mentionedUser.userType?.toLowerCase() === "employee" ? "employeeMention" : "managerMentioned",
                actionUrl: `/workallocation?id=${taskNameDetails._id}`,
                userType: mentionedUser.userType?.toLowerCase() === "employee" ? "employee" : "manager",
                data: { taskName: taskNameDetails?.taskName },
              };
              await NotificationController.sendInAppNotification(notificationData);
            }
          }),
        );
      }

      return UtilController.sendSuccess(req, res, next, {
        message: "Comment added successfully",
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },

  deleteActivityComment: async (req, res, next) => {
    try {
      const { recordId } = req.body;
      let activityComment = await AllocationComments.findById(recordId);
      if (!activityComment) {
        return UtilController.sendError(req, res, next, "Comment not found");
      }
      await AllocationComments.findByIdAndDelete(recordId);

      return UtilController.sendSuccess(req, res, next, {
        message: "Comment deleted successfully",
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },
  updateActivityComment: async (req, res, next) => {
    try {
      const { recordId, content, attachments } = req.body;
      const userId = req.session.userId;

      const requiredFields = ["recordId", "content"];
      const validationErrors = UtilController.validateRequiredFields(req.body, requiredFields);
      if (validationErrors.length > 0) {
        return UtilController.sendError(req, res, next, {
          message: "Validation errors occurred.",
          errors: validationErrors,
        });
      }

      const comment = await AllocationComments.findById(recordId);
      if (!comment) {
        return UtilController.sendError(req, res, next, "Comment not found");
      }
      let allocationAcitvity = await AllocationComments.findByIdAndUpdate(recordId, {
        content,
        updatedBy: userId,
        attachments,
        isUpdated: true,
        updatedAt: Math.floor(Date.now() / 1000),
      });

      return UtilController.sendSuccess(req, res, next, {
        message: "Comment updated successfully",
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },
  //below is for controller for subactivty comments

  addSubActivityComment: async (req, res, next) => {
    try {
      const { subActivityId, content, mentions, attachments, workAllocationId } = req.body;
      const userId = req.session.userId;

      const requiredFields = ["workAllocationId", "content"];
      const validationErrors = UtilController.validateRequiredFields(req.body, requiredFields);
      if (validationErrors.length > 0) {
        return UtilController.sendError(req, res, next, {
          message: "Validation errors occurred.",
          errors: validationErrors,
        });
      }

      const comment = await SubactivityComments.create({
        subActivity: new mongoose.Types.ObjectId(subActivityId),
        workAllocationId: new mongoose.Types.ObjectId(workAllocationId),
        content,
        createdBy: new mongoose.Types.ObjectId(userId),
        mentions: mentions,
        attachments,
        createdAt: Math.floor(Date.now() / 1000),
      });
      // Get task details
      let taskNameDetails = await WorkAllocations.findById(workAllocationId).select(
        "taskName organizationId employeeId managerId",
      );
      // Notify mentioned users
      if (mentions && mentions.length > 0) {
        await Promise.all(
          mentions.map(async mentionId => {
            const mentionedUser = await User.findById(mentionId).select("userType fname");
            if (mentionedUser) {
              let notificationMessage = "";

              let notificationData = {
                userId: mongoose.Types.ObjectId(mentionId),
                senderId: mongoose.Types.ObjectId(userId),
                subject: mentionedUser.userType?.toLowerCase() === "employee" ? "employeeMention" : "managerMention",
                actionUrl: `/workallocation?id=${taskNameDetails._id}`,
                userType: mentionedUser.userType?.toLowerCase(),
                data: { taskName: taskNameDetails?.taskName },
              };

              await NotificationController.sendInAppNotification(notificationData);
            }
          }),
        );
      }

      return UtilController.sendSuccess(req, res, next, {
        message: "Comment added successfully",
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },
  deleteSubActivityComment: async (req, res, next) => {
    try {
      const { recordId } = req.body;
      let activityComment = await SubactivityComments.findById(recordId);
      if (!activityComment) {
        return UtilController.sendError(req, res, next, "Comment not found");
      }
      await SubactivityComments.findByIdAndDelete(recordId);

      return UtilController.sendSuccess(req, res, next, {
        message: "Comment deleted successfully",
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },
  updateSubActivityComment: async (req, res, next) => {
    try {
      const { recordId, content, attachments, workAllocationId } = req.body;
      const userId = req.session.userId;

      const requiredFields = ["recordId", "content"];
      const validationErrors = UtilController.validateRequiredFields(req.body, requiredFields);
      if (validationErrors.length > 0) {
        return UtilController.sendError(req, res, next, {
          message: "Validation errors occurred.",
          errors: validationErrors,
        });
      }

      const comment = await SubactivityComments.findById(recordId);
      if (!comment) {
        return UtilController.sendError(req, res, next, "Comment not found");
      }
      let subActivityComments = await SubactivityComments.findByIdAndUpdate(recordId, {
        content,
        updatedBy: userId,
        workAllocationId: workAllocationId,
        attachments,
        isUpdated: true,
        updatedAt: Math.floor(Date.now() / 1000),
      });

      return UtilController.sendSuccess(req, res, next, {
        message: "Comment updated successfully",
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },
  //get activity all comments
  getActivityComments: async (req, res, next) => {
    try {
      const { workAllocationId, activityId } = req.body;
      let sortOrder = {};
      if (!UtilController.isEmpty(req.body.sortOrder)) {
        sortOrder["updatedAt"] = -1;
      }

      const comments = await AllocationComments.find({ workAllocationId, activity: activityId })
        .sort(sortOrder)
        .populate("createdBy")
        .populate("workAllocationId")
        .populate("activity")
        .populate({
          path: "mentions",
          select: "fname lname email mobileNo _id",
        })
        .populate({
          path: "replies",
          populate: [
            { path: "createdBy", select: "fname lname email mobileNo _id" },
            { path: "mentions", select: "fname lname email mobileNo _id" },
            {
              path: "attachments",
              select: "type url name",
            },
          ],
        });

      UtilController.sendSuccess(req, res, next, {
        comments,
      });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },
  //get subactivity all comments
  getSubActivityComments: async (req, res, next) => {
    try {
      const { workAllocationId, subActivityId } = req.body;
      let sortOrder = {};
      if (!UtilController.isEmpty(req.body.sortOrder)) {
        sortOrder["updatedAt"] = -1;
      }

      const comments = await SubactivityComments.find({ workAllocationId, subActivity: subActivityId })
        .sort(sortOrder)
        .populate("createdBy")
        .populate("workAllocationId")
        .populate("subActivity")
        .populate({
          path: "mentions",
          select: "fname lname email mobileNo _id",
        })
        .populate({
          path: "replies",
          populate: [
            { path: "createdBy", select: "fname lname email mobileNo _id" },
            { path: "mentions", select: "fname lname email mobileNo _id" },
            {
              path: "attachments",
              select: "type url name",
            },
          ],
        });

      UtilController.sendSuccess(req, res, next, {
        comments,
      });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },
  // below is the controller for like the comment
  likeComment: async (req, res, next) => {
    try {
      let recordId = req.body.recordId;
      let userId = req.session.userId;
      let comment = await AllocationComments.findById(recordId);
      if (!comment) {
        return UtilController.sendError(req, res, next, "Comment not found");
      }
      let likes = comment.likes;
      if (likes.includes(userId)) {
        likes = likes.filter(like => like !== userId);
      } else {
        likes.push(userId);
      }
      await AllocationComments.findByIdAndUpdate(recordId, { likes });
      return UtilController.sendSuccess(req, res, next, {
        message: "Comment liked successfully",
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },
  //below is the controller for dislike the comment by user
  dislikeComment: async (req, res, next) => {
    try {
      let recordId = req.body.recordId;
      let userId = req.session.userId;
      let comment = await AllocationComments.findById(recordId);
      if (!comment) {
        return UtilController.sendError(req, res, next, "Comment not found");
      }
      let dislikes = comment.dislikes;
      if (dislikes.includes(userId)) {
        dislikes = dislikes.filter(dislike => dislike !== userId);
      } else {
        dislikes.push(userId);
      }
      await AllocationComments.findByIdAndUpdate(recordId, { dislikes });
      return UtilController.sendSuccess(req, res, next, {
        message: "Comment disliked successfully",
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },
  //below us the controller for reply the comment
  replyComment: async (req, res, next) => {
    try {
      const { content, parentId, workAllocationId, mentions, attachments, activity } = req.body;
      const userId = req.session.userId;

      const requiredFields = ["parentId", "content", "activity", "workAllocationId"];
      const validationErrors = UtilController.validateRequiredFields(req.body, requiredFields);
      if (validationErrors.length > 0) {
        return UtilController.sendError(req, res, next, {
          message: "Validation errors occurred.",
          errors: validationErrors,
        });
      }

      const parentComment = await AllocationComments.findById(parentId);
      if (!parentComment) {
        return UtilController.sendError(req, res, next, "Parent comment not found");
      }

      const reply = {
        content,
        createdBy: new mongoose.Types.ObjectId(userId),
        mentions,
        attachments,
        createdAt: Math.floor(Date.now() / 1000),
      };

      parentComment.replies.push(reply);
      await parentComment.save();
      // Get task details
      let taskNameDetails = await WorkAllocations.findById(workAllocationId).select(
        "taskName organizationId employeeId managerId",
      );
      // Notify mentioned users
      if (mentions && mentions.length > 0) {
        await Promise.all(
          mentions.map(async mentionId => {
            const mentionedUser = await User.findById(mentionId).select("userType fname");
            if (mentionedUser) {
              let notificationMessage = "";

              let notificationData = {
                userId: mongoose.Types.ObjectId(mentionId),
                senderId: mongoose.Types.ObjectId(userId),
                subject: mentionedUser.userType?.toLowerCase() === "employee" ? "employeeMention" : "managerMentioned",
                actionUrl: `/workallocation?id=${taskNameDetails._id}`,
                userType: mentionedUser.userType?.toLowerCase() === "employee" ? "employee" : "manager",
                data: { taskName: taskNameDetails?.taskName },
              };
              await NotificationController.sendInAppNotification(notificationData);
            }
          }),
        );
      }

      return UtilController.sendSuccess(req, res, next, {
        message: "Comment replied successfully",
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },
  //below is the controller for delete the reply
  deleteReply: async (req, res, next) => {
    try {
      const { recordId, replyId } = req.body;

      const parentComment = await AllocationComments.findById(recordId);
      if (!parentComment) {
        return UtilController.sendError(req, res, next, "Comment not found");
      }

      const replyIndex = parentComment.replies.findIndex(reply => reply._id.toString() === replyId);
      if (replyIndex === -1) {
        return UtilController.sendError(req, res, next, "Reply not found");
      }
      parentComment.replies.splice(replyIndex, 1);
      await parentComment.save();

      return UtilController.sendSuccess(req, res, next, {
        message: "Reply deleted successfully",
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },
  //below is the controller for update the reply
  updateReply: async (req, res, next) => {
    try {
      const { recordId, replyId, content, attachments, workAllocationId } = req.body;
      const userId = req.session.userId;

      // Validate required fields
      const requiredFields = ["recordId", "replyId", "content"];
      const validationErrors = UtilController.validateRequiredFields(req.body, requiredFields);
      if (validationErrors.length > 0) {
        return UtilController.sendError(req, res, next, {
          message: "Validation errors occurred.",
          errors: validationErrors,
        });
      }

      // Find the parent comment that contains the reply
      const parentComment = await AllocationComments.findById(recordId);
      if (!parentComment) {
        return UtilController.sendError(req, res, next, "Comment not found");
      }

      // Find the reply within the replies array
      const reply = parentComment.replies.id(replyId);
      if (!reply) {
        return UtilController.sendError(req, res, next, "Reply not found");
      }

      // Update the reply fields
      reply.content = content;
      reply.attachments = attachments;
      reply.isUpdated = true;
      reply.updatedAt = Math.floor(Date.now() / 1000);
      reply.updatedBy = userId;

      // Save the updated parent comment
      await parentComment.save();

      return UtilController.sendSuccess(req, res, next, {
        message: "Reply updated successfully",
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },
  //below is the controller for subactivity like
  likeSubActivityComment: async (req, res, next) => {
    try {
      let recordId = req.body.recordId;
      let userId = req.session.userId;
      let comment = await SubactivityComments.findById(recordId);
      if (!comment) {
        return UtilController.sendError(req, res, next, "Comment not found");
      }
      let likes = comment.likes;
      if (likes.includes(userId)) {
        likes = likes.filter(like => like !== userId);
      } else {
        likes.push(userId);
      }
      await SubactivityComments.findByIdAndUpdate(recordId, { likes });
      return UtilController.sendSuccess(req, res, next, {
        message: "Comment liked successfully",
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },
  //below is the controller for subactivity dislike
  dislikeSubActivityComment: async (req, res, next) => {
    try {
      let recordId = req.body.recordId;
      let userId = req.session.userId;
      let comment = await SubactivityComments.findById(recordId);
      if (!comment) {
        return UtilController.sendError(req, res, next, "Comment not found");
      }
      let dislikes = comment.dislikes;
      if (dislikes.includes(userId)) {
        dislikes = dislikes.filter(dislike => dislike !== userId);
      } else {
        dislikes.push(userId);
      }
      await SubactivityComments.findByIdAndUpdate(recordId, { dislikes });
      return UtilController.sendSuccess(req, res, next, {
        message: "Comment disliked successfully",
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },
  //below is the controller for subactivity reply
  replySubActivityComment: async (req, res, next) => {
    try {
      const { content, parentId, workAllocationId, mentions, attachments, subActivity } = req.body;
      const userId = req.session.userId;

      const requiredFields = ["parentId", "content", "subActivity", "workAllocationId"];
      const validationErrors = UtilController.validateRequiredFields(req.body, requiredFields);
      if (validationErrors.length > 0) {
        return UtilController.sendError(req, res, next, {
          message: "Validation errors occurred.",
          errors: validationErrors,
        });
      }

      // Find the parent comment document
      const parentComment = await SubactivityComments.findById(parentId);
      if (!parentComment) {
        return UtilController.sendError(req, res, next, "Parent comment not found");
      }

      // Create the reply object to be embedded in the replies array
      const reply = {
        content,
        createdBy: new mongoose.Types.ObjectId(userId),
        mentions,
        attachments,
        createdAt: Math.floor(Date.now() / 1000),
        isUpdated: false,
        updatedAt: null,
      };

      // Push the reply object into the replies array
      parentComment.replies.push(reply);

      // Save the parent comment document with the new reply
      await parentComment.save();
      // Get task details
      let taskNameDetails = await WorkAllocations.findById(workAllocationId).select(
        "taskName organizationId employeeId managerId",
      );
      // Notify mentioned users
      if (mentions && mentions.length > 0) {
        await Promise.all(
          mentions.map(async mentionId => {
            const mentionedUser = await User.findById(mentionId).select("userType fname");
            if (mentionedUser) {
              let notificationMessage = "";

              let notificationData = {
                userId: mongoose.Types.ObjectId(mentionId),
                senderId: mongoose.Types.ObjectId(userId),
                subject: mentionedUser.userType?.toLowerCase() === "employee" ? "employeeMention" : "managerMentioned",
                actionUrl: `/workallocation?id=${taskNameDetails._id}`,
                userType: mentionedUser.userType?.toLowerCase() === "employee" ? "employee" : "manager",
                data: { taskName: taskNameDetails?.taskName },
              };
              await NotificationController.sendInAppNotification(notificationData);
            }
          }),
        );
      }

      return UtilController.sendSuccess(req, res, next, {
        message: "Reply added successfully",
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },

  //below is the controller for subactivity delete reply
  deleteSubActivityReply: async (req, res, next) => {
    try {
      const { recordId, replyId } = req.body;

      // Find the parent comment that contains the reply
      const parentComment = await SubactivityComments.findById(recordId);
      if (!parentComment) {
        return UtilController.sendError(req, res, next, "Comment not found");
      }

      // Find the index of the reply in the replies array
      const replyIndex = parentComment.replies.findIndex(reply => reply._id.toString() === replyId);
      if (replyIndex === -1) {
        return UtilController.sendError(req, res, next, "Reply not found");
      }

      // Remove the reply from the replies array
      parentComment.replies.splice(replyIndex, 1);

      // Save the updated parent comment
      await parentComment.save();

      return UtilController.sendSuccess(req, res, next, {
        message: "Reply deleted successfully",
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },
  //below is the controller for subactivity update reply
  updateSubActivityReply: async (req, res, next) => {
    try {
      const { recordId, replyId, content, attachments, workAllocationId } = req.body;
      const userId = req.session.userId;

      const requiredFields = ["recordId", "replyId", "content"];
      const validationErrors = UtilController.validateRequiredFields(req.body, requiredFields);
      if (validationErrors.length > 0) {
        return UtilController.sendError(req, res, next, {
          message: "Validation errors occurred.",
          errors: validationErrors,
        });
      }

      // Find the parent comment document
      const parentComment = await SubactivityComments.findById(recordId);
      if (!parentComment) {
        return UtilController.sendError(req, res, next, "Comment not found");
      }

      // Find the reply by ID within the replies array
      const reply = parentComment.replies.find(reply => reply._id.toString() === replyId);
      if (!reply) {
        return UtilController.sendError(req, res, next, "Reply not found");
      }

      // Update the reply fields
      reply.content = content;
      reply.attachments = attachments;
      reply.workAllocationId = workAllocationId;
      reply.isUpdated = true;
      reply.updatedAt = Math.floor(Date.now() / 1000);
      reply.updatedBy = userId;

      // Save the updated parent comment
      await parentComment.save();

      return UtilController.sendSuccess(req, res, next, {
        message: "Reply updated successfully",
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },
};
