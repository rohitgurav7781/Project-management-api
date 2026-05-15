let mongoose = require("mongoose");

const WorkAllocations = require("../../models/WorkAllocations");
const LeaveRequest = require("../../models/LeaveRequest");
const User = require("../../models/User");
const UtilController = require("../services/UtilController");
const returnCode = require("../../../config/responseCode").returnCode;

const DAY_SECONDS = 86400;
const WORKING_HOURS = 8;
const MAX_RANGE_DAYS = 93;

function parseDurationToHours(durationStr) {
  if (!durationStr) {
    return 0;
  }

  const str = String(durationStr).trim();

  const match = str.match(/(\d+)\s*hr\s*:\s*(\d+)\s*min/i);
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    return hours + minutes / 60;
  }

  const altMatch = str.match(/(\d+\.?\d*)\s*(?:hr|hour|h)/i);
  if (altMatch) {
    return parseFloat(altMatch[1]);
  }

  const numMatch = str.match(/(\d+\.?\d*)/);
  if (numMatch) {
    return parseFloat(numMatch[1]);
  }

  return 0;
}

function formatTime(start, end) {
  const toTime = ts =>
    new Date(ts * 1000).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  return `${toTime(start)} - ${toTime(end)}`;
}

async function buildCalendarView(employees, start, end) {
  const result = [];

  const rangeDays = (end - start) / DAY_SECONDS;
  if (rangeDays < 0 || rangeDays > MAX_RANGE_DAYS) {
    throw new Error(`Date range must be between 1 and ${MAX_RANGE_DAYS} days`);
  }

  const employeeIds = employees.map(emp => emp._id);

  const approvedLeaves = await LeaveRequest.find({
    employeeId: { $in: employeeIds },
    status: "Approved",
    active: true,
  });

  const leaveMap = {};
  approvedLeaves.forEach(leave => {
    const key = leave.employeeId.toString();
    if (!leaveMap[key]) leaveMap[key] = [];
    leaveMap[key].push(leave);
  });

  for (const emp of employees) {
    const empLeaves = leaveMap[emp._id.toString()] || [];
    const days = [];

    for (let day = start; day <= end; day += DAY_SECONDS) {
      if (emp.dateOfJoining && day < emp.dateOfJoining) {
        days.push({
          date: day,
          totalHours: 0,
          status: "Not Joined",
          slots: [],
        });
        continue;
      }

      const dayAllocations = emp.allocations.filter(a => a.startDateTime <= day + DAY_SECONDS && a.endDateTime >= day);

      let totalHours = 0;

      const slots = dayAllocations.map(a => {
        let hours = 0;

        if (a.duration) {
          hours = parseDurationToHours(a.duration);
        }

        if (hours === 0 && a.endDateTime && a.startDateTime && a.endDateTime !== a.startDateTime) {
          hours = (a.endDateTime - a.startDateTime) / 3600;
        }

        totalHours += hours;

        return {
          projectId: a.project._id,
          projectName: a.project.projectName,
          activityName: a.activityName || "",
          hours,
          time: formatTime(a.startDateTime, a.endDateTime),
          status: "Allocated",
        };
      });

      const isOnLeave = empLeaves.some(leave => leave.startDate < day + DAY_SECONDS && leave.endDate >= day);

      let dayStatus = "Idle";

      if (isOnLeave) {
        dayStatus = "On Leave";
      } else if (totalHours === 0) {
        dayStatus = "Idle";
      } else if (totalHours < WORKING_HOURS) {
        dayStatus = "Partially Allocated";
      } else {
        dayStatus = "Allocated";
      }

      days.push({
        date: day,
        totalHours,
        status: dayStatus,
        slots,
      });
    }

    result.push({
      employeeId: emp._id,
      name: emp.name,
      role: emp.position,
      userType: emp.userType,
      profileImage: emp.profileImage,
      calendar: days,
    });
  }

  return result;
}

module.exports = {
  getResourceManagement: async (req, res, next) => {
    try {
      const { organizationId, startDate, endDate, viewMode, selectedTlsId, employeeId } = req.body;

      const start = Number(startDate);
      const end = Number(endDate);
      const mode = String(viewMode || "employee").toLowerCase();

      const sessionUserId = req.session?.userId;
      const sessionUserType = String(req.session?.userType || "").toLowerCase();
      const isSuperAdmin = Boolean(req.session?.isSuperAdmin);
      const sessionOrganizationId = req.session?.organizationId;

      const effectiveOrgId = isSuperAdmin ? organizationId || sessionOrganizationId : sessionOrganizationId;

      const isAdminLike = isSuperAdmin || sessionUserType === "organization admin" || sessionUserType === "admin";

      if (UtilController.isEmpty(sessionUserId)) {
        return UtilController.sendError(req, res, next, {
          message: "Invalid session",
          responseCode: returnCode.invalidSession,
        });
      }

      // ---------- TLS VIEW MODE ----------
      if (mode === "tls") {
        const tlsMatchBase = {
          active: true,
          userType: "TLS",
        };

        if (!UtilController.isEmpty(effectiveOrgId)) {
          tlsMatchBase.organizationId = new mongoose.Types.ObjectId(effectiveOrgId);
        }

        let tlsUsers = [];

        if (isAdminLike) {
          tlsUsers = await User.find(tlsMatchBase).select("_id fname lname position profileImage").lean();
        } else if (sessionUserType === "tls") {
          tlsUsers = await User.find({
            ...tlsMatchBase,
            _id: new mongoose.Types.ObjectId(sessionUserId),
          })
            .select("_id fname lname position profileImage")
            .lean();
        } else if (sessionUserType === "manager") {
          const managerId = new mongoose.Types.ObjectId(sessionUserId);

          const baseAllocationMatch = {
            active: true,
            startDateTime: { $gte: start },
            endDateTime: { $lte: end },
            managerId: { $in: [managerId] },
          };
          if (!UtilController.isEmpty(effectiveOrgId)) {
            baseAllocationMatch.organizationId = new mongoose.Types.ObjectId(effectiveOrgId);
          }

          const tlsIdRows = await WorkAllocations.aggregate([
            { $match: baseAllocationMatch },
            { $unwind: "$managerId" },
            { $group: { _id: "$managerId" } },
          ]);

          const candidateIds = tlsIdRows.map(r => r._id).filter(Boolean);

          if (candidateIds.length) {
            tlsUsers = await User.find({
              ...tlsMatchBase,
              _id: { $in: candidateIds },
            })
              .select("_id fname lname position profileImage")
              .lean();
          }
        } else {
          tlsUsers = [];
        }

        const tlsList = tlsUsers.map(u => ({
          _id: u._id,
          name: `${u.fname || ""} ${u.lname || ""}`.trim(),
          position: u.position,
          profileImage: u.profileImage,
        }));

        if (!tlsList.length) {
          return UtilController.sendSuccess(req, res, next, {
            range: { startDate: start, endDate: end },
            employees: [],
            tls: [],
          });
        }

        let effectiveTlsId =
          selectedTlsId && tlsList.some(t => String(t._id) === String(selectedTlsId)) ? selectedTlsId : tlsList[0]._id;

        const tlsIdObj = new mongoose.Types.ObjectId(effectiveTlsId);

        const baseAllocationMatch = {
          active: true,
          startDateTime: { $gte: start },
          endDateTime: { $lte: end },
        };
        if (!UtilController.isEmpty(effectiveOrgId)) {
          baseAllocationMatch.organizationId = new mongoose.Types.ObjectId(effectiveOrgId);
        }

        if (!isAdminLike && sessionUserType === "manager") {
          const managerId = new mongoose.Types.ObjectId(sessionUserId);
          baseAllocationMatch.managerId = { $all: [managerId, tlsIdObj] };
        } else {
          baseAllocationMatch.$or = [{ managerId: { $in: [tlsIdObj] } }, { createdBy: tlsIdObj }];
        }

        const participantRows = await WorkAllocations.aggregate([
          { $match: baseAllocationMatch },
          { $unwind: "$employeeId" },
          { $group: { _id: "$employeeId" } },
        ]);

        const employeeIds = participantRows.map(r => r._id).filter(Boolean);

        if (!employeeIds.length) {
          return UtilController.sendSuccess(req, res, next, {
            range: { startDate: start, endDate: end },
            employees: [],
            tls: tlsList,
            selectedTlsId: String(effectiveTlsId),
          });
        }

        const employeeMatch = {
          active: true,
          userType: "Employee",
          _id: { $in: employeeIds },
        };

        if (!UtilController.isEmpty(effectiveOrgId)) {
          employeeMatch.organizationId = new mongoose.Types.ObjectId(effectiveOrgId);
        }

        const data = await User.aggregate([
          { $match: employeeMatch },
          {
            $lookup: {
              from: "workallocations",
              let: { userId: "$_id" },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $in: ["$$userId", "$employeeId"] },
                        { $gte: ["$startDateTime", start] },
                        { $lte: ["$endDateTime", end] },
                        { $eq: ["$active", true] },
                      ],
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
                { $unwind: "$project" },
                {
                  $project: {
                    startDateTime: 1,
                    endDateTime: 1,
                    duration: 1,
                    activityName: 1,
                    project: 1,
                  },
                },
              ],
              as: "allocations",
            },
          },
          {
            $project: {
              _id: 1,
              name: { $concat: ["$fname", " ", "$lname"] },
              position: 1,
              profileImage: 1,
              userType: 1,
              dateOfJoining: 1,
              allocations: 1,
            },
          },
        ]);

        return UtilController.sendSuccess(req, res, next, {
          range: { startDate: start, endDate: end },
          employees: await buildCalendarView(data, start, end),
          tls: tlsList,
          selectedTlsId: String(effectiveTlsId),
        });
      }

      // ---------- MANAGER VIEW MODE ----------
      if (mode === "manager") {
        const managerMatchBase = {
          active: true,
          userType: { $in: ["Manager", "manager"] },
        };
        if (!UtilController.isEmpty(effectiveOrgId)) {
          managerMatchBase.organizationId = new mongoose.Types.ObjectId(effectiveOrgId);
        }

        let managerUsers = [];
        if (isAdminLike) {
          managerUsers = await User.find(managerMatchBase)
            .select("_id fname lname position profileImage")
            .lean();
        } else if (sessionUserType === "manager") {
          managerUsers = await User.find({
            ...managerMatchBase,
            _id: new mongoose.Types.ObjectId(sessionUserId),
          })
            .select("_id fname lname position profileImage")
            .lean();
        }

        const managerList = managerUsers.map((u) => ({
          _id: u._id,
          name: `${u.fname || ""} ${u.lname || ""}`.trim(),
          position: u.position,
          profileImage: u.profileImage,
        }));

        if (!managerList.length) {
          return UtilController.sendSuccess(req, res, next, {
            range: { startDate: start, endDate: end },
            employees: [],
            tls: [],
          });
        }

        const effectiveManagerId =
          selectedTlsId && managerList.some((m) => String(m._id) === String(selectedTlsId))
            ? selectedTlsId
            : managerList[0]._id;
        const managerIdObj = new mongoose.Types.ObjectId(effectiveManagerId);

        // Direct reports
        const directReportUsers = await User.find({
          active: true,
          reportingManagerNameID: managerIdObj,
          userType: { $in: ["Employee", "TLS"] },
          ...(effectiveOrgId ? { organizationId: new mongoose.Types.ObjectId(effectiveOrgId) } : {}),
        })
          .select("_id")
          .lean();
        const directReportIds = directReportUsers.map((r) => r._id);

        const baseAllocMatch = {
          active: true,
          startDateTime: { $gte: start },
          endDateTime: { $lte: end },
          managerId: { $in: [managerIdObj] },
        };
        if (!UtilController.isEmpty(effectiveOrgId)) {
          baseAllocMatch.organizationId = new mongoose.Types.ObjectId(effectiveOrgId);
        }
        const allocRows = await WorkAllocations.aggregate([
          { $match: baseAllocMatch },
          { $unwind: "$employeeId" },
          { $group: { _id: "$employeeId" } },
        ]);
        const allocationEmployeeIds = allocRows.map((r) => r._id).filter(Boolean);
        const allowedUserIds = Array.from(
          new Set([
            ...directReportIds.map((id) => id.toString()),
            ...allocationEmployeeIds.map((id) => id.toString()),
          ]),
        ).map((id) => new mongoose.Types.ObjectId(id));

        if (!allowedUserIds.length) {
          return UtilController.sendSuccess(req, res, next, {
            range: { startDate: start, endDate: end },
            employees: [],
            tls: managerList,
            selectedTlsId: String(effectiveManagerId),
          });
        }

        const employeeMatch = {
          active: true,
          userType: { $in: ["Employee", "TLS"] },
          _id: { $in: allowedUserIds },
        };
        if (!UtilController.isEmpty(effectiveOrgId)) {
          employeeMatch.organizationId = new mongoose.Types.ObjectId(effectiveOrgId);
        }

        const data = await User.aggregate([
          { $match: employeeMatch },
          {
            $lookup: {
              from: "workallocations",
              let: { userId: "$_id" },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $in: ["$$userId", "$employeeId"] },
                        { $gte: ["$startDateTime", start] },
                        { $lte: ["$endDateTime", end] },
                        { $eq: ["$active", true] },
                      ],
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
                { $unwind: "$project" },
                {
                  $project: {
                    startDateTime: 1,
                    endDateTime: 1,
                    duration: 1,
                    activityName: 1,
                    project: 1,
                  },
                },
              ],
              as: "allocations",
            },
          },
          {
            $project: {
              _id: 1,
              name: { $concat: ["$fname", " ", "$lname"] },
              position: 1,
              profileImage: 1,
              userType: 1,
              dateOfJoining: 1,
              allocations: 1,
            },
          },
        ]);

        return UtilController.sendSuccess(req, res, next, {
          range: { startDate: start, endDate: end },
          employees: await buildCalendarView(data, start, end),
          tls: managerList,
          selectedTlsId: String(effectiveManagerId),
        });
      }

      // ---------- EMPLOYEE VIEW MODE (default) ----------
      const userMatch = {
        active: true,
        userType: { $in: ["Employee", "TLS"] },
      };

      if (!UtilController.isEmpty(effectiveOrgId)) {
        userMatch.organizationId = new mongoose.Types.ObjectId(effectiveOrgId);
      }

      if (!isAdminLike && sessionUserType === "manager") {
        const managerId = new mongoose.Types.ObjectId(sessionUserId);
        const directReports = await User.find({
          active: true,
          reportingManagerNameID: managerId,
          userType: { $in: ["Employee", "TLS"] },
          ...(effectiveOrgId ? { organizationId: new mongoose.Types.ObjectId(effectiveOrgId) } : {}),
        })
          .select("_id")
          .lean();
        const directReportIds = directReports.map((r) => r._id);

        const baseAllocMatch = {
          active: true,
          startDateTime: { $gte: start },
          endDateTime: { $lte: end },
          managerId: { $in: [managerId] },
        };
        if (!UtilController.isEmpty(effectiveOrgId)) {
          baseAllocMatch.organizationId = new mongoose.Types.ObjectId(effectiveOrgId);
        }
        const allocRows = await WorkAllocations.aggregate([
          { $match: baseAllocMatch },
          { $unwind: "$employeeId" },
          { $group: { _id: "$employeeId" } },
        ]);
        const allocationIds = allocRows.map((r) => r._id).filter(Boolean);
        const allowedIds = Array.from(
          new Set([
            ...directReportIds.map((id) => id.toString()),
            ...allocationIds.map((id) => id.toString()),
          ]),
        ).map((id) => new mongoose.Types.ObjectId(id));
        userMatch._id = { $in: allowedIds };
      }

      if (!isAdminLike && sessionUserType === "tls") {
        const tlsId = new mongoose.Types.ObjectId(sessionUserId);

        const baseAllocationMatch = {
          active: true,
          startDateTime: { $gte: start },
          endDateTime: { $lte: end },
        };
        if (!UtilController.isEmpty(effectiveOrgId)) {
          baseAllocationMatch.organizationId = new mongoose.Types.ObjectId(effectiveOrgId);
        }

        const tlsProjectRows = await WorkAllocations.aggregate([
          {
            $match: {
              ...baseAllocationMatch,
              $or: [{ managerId: { $in: [tlsId] } }, { createdBy: tlsId }],
            },
          },
          { $group: { _id: "$projectId" } },
        ]);

        const projectIds = tlsProjectRows.map(r => r._id).filter(Boolean);

        let allowedUserIds = [tlsId];
        if (projectIds.length) {
          const participantRows = await WorkAllocations.aggregate([
            {
              $match: {
                ...baseAllocationMatch,
                projectId: { $in: projectIds },
              },
            },
            { $unwind: "$employeeId" },
            { $group: { _id: "$employeeId" } },
          ]);

          allowedUserIds = Array.from(
            new Set([tlsId.toString(), ...participantRows.map(r => String(r._id)).filter(Boolean)]),
          ).map(id => new mongoose.Types.ObjectId(id));
        }

        userMatch._id = { $in: allowedUserIds };
      }

      if (!isAdminLike && sessionUserType === "employee") {
        userMatch._id = new mongoose.Types.ObjectId(sessionUserId);
      }

      if (!UtilController.isEmpty(employeeId)) {
        const empObjectId = new mongoose.Types.ObjectId(employeeId);
        if (userMatch._id && userMatch._id.$in) {
          userMatch._id.$in = userMatch._id.$in.filter(id => String(id) === String(empObjectId));
        } else if (userMatch._id && userMatch._id.$in == null && userMatch._id.$eq == null) {
          if (String(userMatch._id) !== String(empObjectId)) {
            userMatch._id = new mongoose.Types.ObjectId("000000000000000000000000");
          }
        } else {
          userMatch._id = empObjectId;
        }
      }

      const data = await User.aggregate([
        {
          $match: {
            ...userMatch,
          },
        },
        {
          $lookup: {
            from: "workallocations",
            let: { userId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $in: ["$$userId", "$employeeId"] },
                      { $gte: ["$startDateTime", start] },
                      { $lte: ["$endDateTime", end] },
                      { $eq: ["$active", true] },
                    ],
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
              { $unwind: "$project" },
              {
                $project: {
                  startDateTime: 1,
                  endDateTime: 1,
                  duration: 1,
                  activityName: 1,
                  project: 1,
                },
              },
            ],
            as: "allocations",
          },
        },
        {
          $project: {
            _id: 1,
            name: { $concat: ["$fname", " ", "$lname"] },
            position: 1,
            profileImage: 1,
            userType: 1,
            dateOfJoining: 1,
            allocations: 1,
          },
        },
      ]);

      UtilController.sendSuccess(req, res, next, {
        range: { startDate: start, endDate: end },
        employees: await buildCalendarView(data, start, end),
      });
    } catch (err) {
      console.error(err);
      UtilController.sendError(req, res, next, err);
    }
  },
};
