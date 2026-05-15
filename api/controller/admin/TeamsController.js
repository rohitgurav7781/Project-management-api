const mongoose = require("mongoose");

const Department = require("../../models/Department");
const User = require("../../models/User");
const Notification = require("../../models/Notification");
const returnCode = require("../../../config/responseCode").returnCode;
const UtilController = require("./../services/UtilController");
const Teams = require("../../models/Teams");

function validateStrings(inputObject, fields) {
  const errors = [];

  fields.forEach(field => {
    const value = inputObject[field];
    if (typeof value !== "string" || value.trim() === "") {
      errors.push(`${field} must be a non-empty string.`);
    }
  });

  return errors;
}

module.exports = {
  createTeams: async (req, res, next) => {
    try {
      const requiredFields = ["departmentId", "departmentName", "employeeId", "employeeName"];

      let validationErrors = UtilController.validateRequiredFields(req.body, requiredFields);
      if (validationErrors.length > 0) {
        return UtilController.sendError(req, res, next, {
          message: "Validation errors occurred.",
          errors: validationErrors,
          responseCode: returnCode.incompleteBody,
        });
      }

      validationErrors = validateStrings(req.body, requiredFields);
      if (validationErrors.length > 0) {
        return UtilController.sendError(req, res, next, {
          message: "Validation errors occurred.",
          errors: validationErrors,
          responseCode: returnCode.incompleteBody,
        });
      }

      const { departmentId, departmentName, employeeId, employeeName, designationId, designationName } = req.body;

      const userId = req.session.userId;
      const organizationId = req.session.organizationId;

      if (!mongoose.Types.ObjectId.isValid(departmentId)) {
        return UtilController.sendError(req, res, next, {
          message: "Invalid department ID provided.",
          responseCode: returnCode.incompleteBody,
        });
      }

      const departmentExists = await Department.findOne({
        _id: mongoose.Types.ObjectId(departmentId),
        active: true,
      });

      if (!departmentExists) {
        return UtilController.sendError(req, res, next, {
          message: "Department not found.",
          responseCode: returnCode.recordNotFound,
        });
      }

      if (!mongoose.Types.ObjectId.isValid(employeeId)) {
        return UtilController.sendError(req, res, next, {
          message: "Invalid employee ID provided.",
          responseCode: returnCode.incompleteBody,
        });
      }

      const employeeExists = await User.findOne({
        _id: mongoose.Types.ObjectId(employeeId),
        active: true,
      });

      if (!employeeExists) {
        return UtilController.sendError(req, res, next, {
          message: "Employee not found.",
          responseCode: returnCode.recordNotFound,
        });
      }

      // const existingTeamMember = await Teams.findOne({
      //   active: true,
      //   departmentId: mongoose.Types.ObjectId(departmentId),
      //   employeeId: mongoose.Types.ObjectId(employeeId),
      // });

      // if (existingTeamMember) {
      //   return UtilController.sendError(req, res, next, {
      //     message: "This employee is already a member of this department team.",
      //     responseCode: returnCode.duplicate,
      //   });
      // }

      const teamsData = {
        organizationId: mongoose.Types.ObjectId(organizationId),
        departmentId: mongoose.Types.ObjectId(departmentId),
        departmentName,
        employeeId: mongoose.Types.ObjectId(employeeId),
        employeeName,
        designationName: designationName || "",
        createdBy: mongoose.Types.ObjectId(userId),
        updatedBy: mongoose.Types.ObjectId(userId),
      };

      if (designationId && mongoose.Types.ObjectId.isValid(designationId)) {
        teamsData.designationId = mongoose.Types.ObjectId(designationId);
      }

      const teams = new Teams(teamsData);
      const result = await teams.save();

      await Notification.create({
        userType: "organizationAdmin",
        recordId: result?._id,
        userId: userId,
        title: `New Team Member Added`,
        organizationId: organizationId,
        body: `${employeeName} has been added to ${departmentName} team. Click to view details.`,
        type: "system",
        read: false,
        visibleOnHome: true,
        actionUrl: `/teams?id=${result._id}`,
      });

      return UtilController.sendSuccess(req, res, next, {
        message: "Team member added successfully.",
        teams: result,
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },

  queryAllTeams: async (req, res, next) => {
    try {
      let sortOrder = {};
      let organizationId = req.body.organizationId || req.session.organizationId;
      let departmentId = req.body.departmentId;
      let searchKey = req.body.keyword ?? "";

      if (!UtilController.isEmpty(req.body.sortOrder) && !UtilController.isEmpty(req.body.sortField)) {
        sortOrder[req.body.sortField] = req.body.sortOrder === "false" ? -1 : 1;
      } else {
        sortOrder = {
          createdAt: -1,
        };
      }

      let page = 0;
      let pageSize = 10;
      if (!UtilController.isEmpty(req.body.page) && !UtilController.isEmpty(req.body.pageSize)) {
        page = Number(req.body.page);
        pageSize = Number(req.body.pageSize);
      }

      let matchStage = {
        active: req.body.active ?? true,
      };

      if (!UtilController.isEmpty(searchKey)) {
        matchStage["$and"] = [
          {
            $or: [{ managerId: { $exists: false } }, { managerId: null }],
          },
          {
            $or: [
              { employeeName: { $regex: searchKey, $options: "i" } },
              { departmentName: { $regex: searchKey, $options: "i" } },
              { designationName: { $regex: searchKey, $options: "i" } },
            ],
          },
        ];
      } else {
        matchStage["$or"] = [{ managerId: { $exists: false } }, { managerId: null }];
      }

      if (!UtilController.isEmpty(organizationId)) {
        matchStage["organizationId"] = new mongoose.Types.ObjectId(organizationId);
      }

      if (!UtilController.isEmpty(departmentId)) {
        matchStage["departmentId"] = new mongoose.Types.ObjectId(departmentId);
      }

      if (!UtilController.isEmpty(req.body.startDate) && !UtilController.isEmpty(req.body.endDate)) {
        let dateFilterPipeline = [
          { $match: matchStage },
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
          {
            $match: {
              "employeeDetails.dateOfJoining": {
                $gte: Number(req.body.startDate),
                $lte: Number(req.body.endDate),
              },
            },
          },
          {
            $project: {
              _id: 1,
            },
          },
        ];

        let filteredIds = await Teams.aggregate(dateFilterPipeline);
        let teamIds = filteredIds.map(item => item._id);

        matchStage["_id"] = { $in: teamIds };
      }

      let totalCountPipeline = [{ $match: matchStage }, { $count: "count" }];
      let totalCountResult = await Teams.aggregate(totalCountPipeline);
      let totalCount = totalCountResult[0]?.count ?? 0;

      let pipeline = [
        { $match: matchStage },

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

        {
          $lookup: {
            from: "departments",
            localField: "departmentId",
            foreignField: "_id",
            as: "departmentDetails",
          },
        },
        {
          $unwind: {
            path: "$departmentDetails",
            preserveNullAndEmptyArrays: true,
          },
        },

        {
          $project: {
            _id: "$_id",
            employeeId: "$employeeDetails.employeeId",
            employeeObjectId: "$employeeDetails._id",
            employeeName: "$employeeName",
            dateOfJoining: "$employeeDetails.dateOfJoining",
            experience: "$employeeDetails.totalExp",
            designation: "$designationName",
            profileImage: "$employeeDetails.profileImage",
            status: {
              $cond: {
                if: { $eq: ["$active", true] },
                then: "active",
                else: "inactive",
              },
            },
            departmentName: "$departmentName",
            departmentId: "$departmentId",
            organizationId: "$organizationId",
            createdAt: "$createdAt",
            updatedAt: "$updatedAt",
          },
        },

        { $sort: sortOrder },
        { $skip: page * pageSize },
        { $limit: pageSize },
      ];

      let result = await Teams.aggregate(pipeline);

      UtilController.sendSuccess(req, res, next, {
        rows: result,
        pages: Math.ceil(totalCount / pageSize),
        filterRecords: totalCount,
      });
    } catch (err) {
      console.error(err);
      UtilController.sendError(req, res, next, err);
    }
  },
  getTeamById: async (req, res, next) => {
    try {
      const { recordId } = req.body;

      if (!recordId || !mongoose.Types.ObjectId.isValid(recordId)) {
        return UtilController.sendError(req, res, next, {
          message: "Invalid team ID provided.",
          responseCode: returnCode.incompleteBody,
        });
      }

      let pipeline = [
        {
          $match: {
            _id: mongoose.Types.ObjectId(recordId),
            active: true,
          },
        },

        // Lookup employee details
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

        // Lookup department details
        {
          $lookup: {
            from: "departments",
            localField: "departmentId",
            foreignField: "_id",
            as: "departmentDetails",
          },
        },
        {
          $unwind: {
            path: "$departmentDetails",
            preserveNullAndEmptyArrays: true,
          },
        },

        // Lookup created by user
        {
          $lookup: {
            from: "users",
            localField: "createdBy",
            foreignField: "_id",
            as: "createdByDetails",
          },
        },
        {
          $unwind: {
            path: "$createdByDetails",
            preserveNullAndEmptyArrays: true,
          },
        },

        // Lookup updated by user
        {
          $lookup: {
            from: "users",
            localField: "updatedBy",
            foreignField: "_id",
            as: "updatedByDetails",
          },
        },
        {
          $unwind: {
            path: "$updatedByDetails",
            preserveNullAndEmptyArrays: true,
          },
        },

        {
          $project: {
            _id: "$_id",
            employeeId: "$employeeDetails.employeeId",
            employeeObjectId: "$employeeDetails._id",
            employeeObjectId: "$employeeDetails._id",
            employeeName: "$employeeName",
            employeeEmail: "$employeeDetails.email",
            employeeMobile: "$employeeDetails.mobileNo",
            dateOfJoining: "$employeeDetails.dateOfJoining",
            experience: "$employeeDetails.totalExp",
            designation: "$designationName",
            designationId: "$designationId",
            status: {
              $cond: {
                if: { $eq: ["$active", true] },
                then: "active",
                else: "inactive",
              },
            },
            departmentName: "$departmentName",
            departmentId: "$departmentId",
            organizationId: "$organizationId",
            profileImage: "$employeeDetails.profileImage",
            position: "$employeeDetails.position",
            createdAt: "$createdAt",
            updatedAt: "$updatedAt",
            createdBy: {
              $concat: [
                { $ifNull: ["$createdByDetails.fname", ""] },
                " ",
                { $ifNull: ["$createdByDetails.lname", ""] },
              ],
            },
            updatedBy: {
              $concat: [
                { $ifNull: ["$updatedByDetails.fname", ""] },
                " ",
                { $ifNull: ["$updatedByDetails.lname", ""] },
              ],
            },
          },
        },
      ];

      let result = await Teams.aggregate(pipeline);

      if (!result || result.length === 0) {
        return UtilController.sendError(req, res, next, {
          message: "Team member not found.",
          responseCode: returnCode.recordNotFound,
        });
      }

      UtilController.sendSuccess(req, res, next, {
        data: result[0],
      });
    } catch (err) {
      console.error(err);
      UtilController.sendError(req, res, next, err);
    }
  },

  updateTeam: async (req, res, next) => {
    try {
      const { recordId, departmentId, departmentName, employeeId, employeeName, designationId, designationName } =
        req.body;

      if (!recordId || !mongoose.Types.ObjectId.isValid(recordId)) {
        return UtilController.sendError(req, res, next, {
          message: "Invalid team ID provided.",
          responseCode: returnCode.incompleteBody,
        });
      }

      const team = await Teams.findOne({
        _id: mongoose.Types.ObjectId(recordId),
        active: true,
      });

      if (!team) {
        return UtilController.sendError(req, res, next, {
          message: "Team member not found.",
          responseCode: returnCode.recordNotFound,
        });
      }

      let updateData = {
        updatedBy: mongoose.Types.ObjectId(req.session.userId),
        updatedAt: Math.floor(Date.now() / 1000),
      };

      // Validate and update department if provided
      if (!UtilController.isEmpty(departmentId)) {
        if (!mongoose.Types.ObjectId.isValid(departmentId)) {
          return UtilController.sendError(req, res, next, {
            message: "Invalid department ID provided.",
            responseCode: returnCode.incompleteBody,
          });
        }

        const departmentExists = await Department.findOne({
          _id: mongoose.Types.ObjectId(departmentId),
          active: true,
        });

        if (!departmentExists) {
          return UtilController.sendError(req, res, next, {
            message: "Department not found.",
            responseCode: returnCode.recordNotFound,
          });
        }

        updateData.departmentId = mongoose.Types.ObjectId(departmentId);
        updateData.departmentName = departmentName || departmentExists.name;
      }

      // Validate and update employee if provided
      if (!UtilController.isEmpty(employeeId)) {
        if (!mongoose.Types.ObjectId.isValid(employeeId)) {
          return UtilController.sendError(req, res, next, {
            message: "Invalid employee ID provided.",
            responseCode: returnCode.incompleteBody,
          });
        }

        const employeeExists = await User.findOne({
          _id: mongoose.Types.ObjectId(employeeId),
          active: true,
        });

        if (!employeeExists) {
          return UtilController.sendError(req, res, next, {
            message: "Employee not found.",
            responseCode: returnCode.recordNotFound,
          });
        }

        updateData.employeeId = mongoose.Types.ObjectId(employeeId);
        updateData.employeeName = employeeName || `${employeeExists.fname} ${employeeExists.lname}`;
      }

      // Update designation if provided
      if (!UtilController.isEmpty(designationName)) {
        updateData.designationName = designationName;
      }

      if (!UtilController.isEmpty(designationId) && mongoose.Types.ObjectId.isValid(designationId)) {
        updateData.designationId = mongoose.Types.ObjectId(designationId);
      }

      const result = await Teams.findByIdAndUpdate(recordId, { $set: updateData }, { new: true });

      // Send notification
      await Notification.create({
        userType: "organizationAdmin",
        recordId: result?._id,
        userId: req.session.userId,
        title: `Team Member Updated`,
        organizationId: team.organizationId,
        body: `Team member details have been updated. Click to view changes.`,
        type: "system",
        read: false,
        visibleOnHome: true,
        actionUrl: `/teams?id=${result._id}`,
      });

      UtilController.sendSuccess(req, res, next, {
        message: "Team member updated successfully.",
        data: result,
      });
    } catch (err) {
      console.error(err);
      UtilController.sendError(req, res, next, err);
    }
  },

  deleteTeam: async (req, res, next) => {
    try {
      const { recordId } = req.body;

      if (!recordId || !mongoose.Types.ObjectId.isValid(recordId)) {
        return UtilController.sendError(req, res, next, {
          message: "Invalid team ID provided.",
          responseCode: returnCode.incompleteBody,
        });
      }

      const team = await Teams.findOne({
        _id: mongoose.Types.ObjectId(recordId),
        active: true,
      });

      if (!team) {
        return UtilController.sendError(req, res, next, {
          message: "Team member not found.",
          responseCode: returnCode.recordNotFound,
        });
      }

      const result = await Teams.findByIdAndUpdate(
        recordId,
        {
          active: false,
          updatedBy: mongoose.Types.ObjectId(req.session.userId),
          updatedAt: Math.floor(Date.now() / 1000),
        },
        { new: true },
      );

      // Send notification
      await Notification.create({
        userType: "organizationAdmin",
        recordId: result?._id,
        userId: req.session.userId,
        title: `Team Member Removed`,
        organizationId: team.organizationId,
        body: `${team.employeeName} has been removed from ${team.departmentName} team.`,
        type: "system",
        read: false,
        visibleOnHome: true,
        actionUrl: `/teams`,
      });

      UtilController.sendSuccess(req, res, next, {
        message: "Team member deleted successfully.",
      });
    } catch (err) {
      console.error(err);
      UtilController.sendError(req, res, next, err);
    }
  },
  createTeamForManager: async (req, res, next) => {
    try {
      const requiredFields = [
        "departmentId",
        "departmentName",
        "employeeId",
        "employeeName",
        "managerId",
        "managerName",
      ];

      let validationErrors = UtilController.validateRequiredFields(req.body, requiredFields);
      if (validationErrors.length > 0) {
        return UtilController.sendError(req, res, next, {
          message: "Validation errors occurred.",
          errors: validationErrors,
          responseCode: returnCode.incompleteBody,
        });
      }

      validationErrors = validateStrings(req.body, requiredFields);
      if (validationErrors.length > 0) {
        return UtilController.sendError(req, res, next, {
          message: "Validation errors occurred.",
          errors: validationErrors,
          responseCode: returnCode.incompleteBody,
        });
      }

      const {
        departmentId,
        departmentName,
        employeeId,
        employeeName,
        managerId,
        managerName,
        designationId,
        designationName,
        role, // optional: manager, tl, tls, teamlead
      } = req.body;

      const userId = req.session.userId;
      const organizationId = req.session.organizationId;

      if (!mongoose.Types.ObjectId.isValid(departmentId)) {
        return UtilController.sendError(req, res, next, {
          message: "Invalid department ID provided.",
          responseCode: returnCode.incompleteBody,
        });
      }

      const departmentExists = await Department.findOne({
        _id: mongoose.Types.ObjectId(departmentId),
        active: true,
      });

      if (!departmentExists) {
        return UtilController.sendError(req, res, next, {
          message: "Department not found.",
          responseCode: returnCode.recordNotFound,
        });
      }

      if (!mongoose.Types.ObjectId.isValid(employeeId)) {
        return UtilController.sendError(req, res, next, {
          message: "Invalid employee ID provided.",
          responseCode: returnCode.incompleteBody,
        });
      }

      const employeeExists = await User.findOne({
        _id: mongoose.Types.ObjectId(employeeId),
        active: true,
      });

      if (!employeeExists) {
        return UtilController.sendError(req, res, next, {
          message: "Employee not found.",
          responseCode: returnCode.recordNotFound,
        });
      }

      if (!mongoose.Types.ObjectId.isValid(managerId)) {
        return UtilController.sendError(req, res, next, {
          message: "Invalid manager ID provided.",
          responseCode: returnCode.incompleteBody,
        });
      }

      const managerExists = await User.findOne({
        _id: mongoose.Types.ObjectId(managerId),
        active: true,
      });

      if (!managerExists) {
        return UtilController.sendError(req, res, next, {
          message: "Manager not found.",
          responseCode: returnCode.recordNotFound,
        });
      }

      // Prevent duplicate (by department, employee, manager)
      const existingMember = await Teams.findOne({
        active: true,
        departmentId: mongoose.Types.ObjectId(departmentId),
        employeeId: mongoose.Types.ObjectId(employeeId),
        managerId: mongoose.Types.ObjectId(managerId),
      });

      if (existingMember) {
        return UtilController.sendError(req, res, next, {
          message: "This employee is already assigned to this manager's department team.",
          responseCode: returnCode.duplicate,
        });
      }

      // Compose entry
      const teamData = {
        organizationId: mongoose.Types.ObjectId(organizationId),
        departmentId: mongoose.Types.ObjectId(departmentId),
        departmentName,
        employeeId: mongoose.Types.ObjectId(employeeId),
        employeeName,
        managerId: mongoose.Types.ObjectId(managerId),
        managerName,
        role: role || "",
        designationName: designationName || "",
        createdBy: mongoose.Types.ObjectId(userId),
        updatedBy: mongoose.Types.ObjectId(userId),
      };
      if (designationId && mongoose.Types.ObjectId.isValid(designationId)) {
        teamData.designationId = mongoose.Types.ObjectId(designationId);
      }

      const team = new Teams(teamData);
      const result = await team.save();

      // Optionally notify
      await Notification.create({
        userType: "organizationAdmin",
        recordId: result?._id,
        userId: userId,
        title: `New ${role ? role.charAt(0).toUpperCase() + role.slice(1) : "Team"} Member Added`,
        organizationId: organizationId,
        body: `${employeeName} was added to ${departmentName}'s (${managerName}'s) team.`,
        type: "system",
        read: false,
        visibleOnHome: true,
        actionUrl: `/teams?id=${result._id}`,
      });

      return UtilController.sendSuccess(req, res, next, {
        message: "Team member added under manager successfully.",
        teams: result,
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },
  queryTeamsForManager: async (req, res, next) => {
    try {
      let {
        managerId,
        departmentId,
        keyword = "",
        sortField = "createdAt",
        sortOrder = "desc",
        page = 0,
        pageSize = 10,
        active = true,
        startDate,
        endDate,
      } = req.body;

      if (!sortField || sortField.trim() === "") {
        sortField = "createdAt";
      }

      if (!sortOrder || (sortOrder !== "desc" && sortOrder !== "asc")) {
        sortOrder = "desc";
      }

      const matchStage = {};
      matchStage.active = typeof active !== "undefined" ? !!active : true;

      if (managerId && mongoose.Types.ObjectId.isValid(managerId)) {
        matchStage.managerId = mongoose.Types.ObjectId(managerId);
      }

      if (departmentId && mongoose.Types.ObjectId.isValid(departmentId)) {
        matchStage.departmentId = mongoose.Types.ObjectId(departmentId);
      }

      if (keyword && keyword.trim() !== "") {
        matchStage.$or = [
          { employeeName: { $regex: keyword, $options: "i" } },
          { managerName: { $regex: keyword, $options: "i" } },
          { designationName: { $regex: keyword, $options: "i" } },
          { departmentName: { $regex: keyword, $options: "i" } },
        ];
      }

      page = Number(page) || 0;
      pageSize = Number(pageSize) || 10;

      // Date of Joining Filtering
      if (!UtilController.isEmpty(startDate) && !UtilController.isEmpty(endDate)) {
        let dateFilterPipeline = [
          { $match: matchStage },
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
          {
            $match: {
              "employeeDetails.dateOfJoining": {
                $gte: Number(startDate),
                $lte: Number(endDate),
              },
            },
          },
          {
            $project: {
              _id: 1,
            },
          },
        ];

        let filteredIds = await Teams.aggregate(dateFilterPipeline);
        let teamIds = filteredIds.map(item => item._id);

        matchStage["_id"] = { $in: teamIds };
      }

      const totalRecords = await Teams.countDocuments(matchStage);

      const sortStage = {};
      sortStage[sortField] = sortOrder === "desc" ? -1 : 1;

      const pipeline = [
        { $match: matchStage },
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
            from: "users",
            localField: "managerId",
            foreignField: "_id",
            as: "managerDetails",
          },
        },
        { $unwind: { path: "$managerDetails", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "departments",
            localField: "departmentId",
            foreignField: "_id",
            as: "departmentDetails",
          },
        },
        { $unwind: { path: "$departmentDetails", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            departmentId: 1,
            departmentName: {
              $ifNull: ["$departmentName", "$departmentDetails.name"],
            },

            employeeId: "$employeeDetails.employeeId",
            employeeObjectId: "$employeeDetails._id",
            employeeName: {
              $ifNull: [
                "$employeeName",
                {
                  $concat: [
                    { $ifNull: ["$employeeDetails.fname", ""] },
                    " ",
                    { $ifNull: ["$employeeDetails.lname", ""] },
                  ],
                },
              ],
            },
            employeeEmail: "$employeeDetails.email",
            managerId: 1,
            managerName: {
              $ifNull: [
                "$managerName",
                {
                  $concat: [
                    { $ifNull: ["$managerDetails.fname", ""] },
                    " ",
                    { $ifNull: ["$managerDetails.lname", ""] },
                  ],
                },
              ],
            },
            managerEmail: "$managerDetails.email",
            role: 1,
            designationId: 1,
            designationName: {
              $ifNull: ["$designationName", "$employeeDetails.position"],
            },
            designation: {
              $ifNull: ["$designationName", "$employeeDetails.position"],
            },
            dateOfJoining: "$employeeDetails.dateOfJoining",
            experience: "$employeeDetails.totalExp",
            profileImage: "$employeeDetails.profileImage",
            createdAt: 1,
            updatedAt: 1,
            status: {
              $cond: {
                if: { $eq: ["$active", true] },
                then: "active",
                else: "inactive",
              },
            },
          },
        },
        { $sort: sortStage },
        { $skip: page * pageSize },
        { $limit: pageSize },
      ];

      const results = await Teams.aggregate(pipeline);

      return UtilController.sendSuccess(req, res, next, {
        rows: results,
        pages: Math.ceil(totalRecords / pageSize),
        filterRecords: totalRecords,
      });
    } catch (err) {
      console.error("Error in queryTeamsForManager:", err);
      return UtilController.sendError(req, res, next, err);
    }
  },
  deleteTeamForManager: async (req, res, next) => {
    try {
      const { recordId, managerId } = req.body;

      if (!recordId || !mongoose.Types.ObjectId.isValid(recordId)) {
        return UtilController.sendError(req, res, next, {
          message: "Invalid team ID provided.",
          responseCode: returnCode.incompleteBody,
        });
      }

      if (!managerId || !mongoose.Types.ObjectId.isValid(managerId)) {
        return UtilController.sendError(req, res, next, {
          message: "Invalid manager ID provided.",
          responseCode: returnCode.incompleteBody,
        });
      }

      const team = await Teams.findOne({
        _id: mongoose.Types.ObjectId(recordId),
        managerId: mongoose.Types.ObjectId(managerId),
        active: true,
      });

      if (!team) {
        return UtilController.sendError(req, res, next, {
          message: "Team member not found or doesn't belong to this manager.",
          responseCode: returnCode.recordNotFound,
        });
      }

      const result = await Teams.findByIdAndUpdate(
        recordId,
        {
          active: false,
          updatedBy: mongoose.Types.ObjectId(req.session.userId),
          updatedAt: Math.floor(Date.now() / 1000),
        },
        { new: true },
      );

      await Notification.create({
        userType: "organizationAdmin",
        recordId: result?._id,
        userId: req.session.userId,
        title: `Team Member Removed from Manager's Team`,
        organizationId: team.organizationId,
        body: `${team.employeeName} has been removed from ${team.managerName}'s team in ${team.departmentName}.`,
        type: "system",
        read: false,
        visibleOnHome: true,
        actionUrl: `/teams/manager/${managerId}`,
      });

      UtilController.sendSuccess(req, res, next, {
        message: "Team member removed from manager's team successfully.",
      });
    } catch (err) {
      console.error(err);
      UtilController.sendError(req, res, next, err);
    }
  },
};
