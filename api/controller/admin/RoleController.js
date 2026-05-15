let request = require("request");
let mongoose = require("mongoose");
const returnCode = require("./../../../config/responseCode").returnCode;
const roleConfig = require("./../../../config/roleConfig");
const { permission } = require("../../../config/roleConfig");
const User = require("./../../models/User");
const Role = require("./../../models/Role");
const Tag = require("./../../models/Tag");
const VersionTrack = require("./../../models/VersionTrack");
const NotificationController = require("./../services/NotificationController");

const UtilController = require("./../services/UtilController");
const Organizations = require("../../models/Organizations");
const Notification = require("../../models/Notification");
module.exports = {
  queryRole: async (req, res, next) => {
    try {
      const { keyword, startDate, endDate, active, createdBy, sortField, sortOrder, page, pageSize } = req.body;
      let organizationId = req.session.organizationId ?? req.body.organizationId;
      const isActive = active ?? true;
      let match = {
        active: isActive,
      };

      if (!UtilController.isEmpty(createdBy)) {
        match["createdBy"] = mongoose.Types.ObjectId(createdBy);
      }
      if (!UtilController.isEmpty(organizationId)) {
        match["organizationId"] = mongoose.Types.ObjectId(organizationId);
      }
      if (!UtilController.isEmpty(keyword)) {
        match["$or"] = [{ name: { $regex: keyword, $options: "i" } }];
      }

      if (!UtilController.isEmpty(startDate) && !UtilController.isEmpty(endDate)) {
        match["$and"] = [{ createdAt: { $gte: parseInt(startDate) } }, { createdAt: { $lte: parseInt(endDate) } }];
      }
      const sort = {};
      if (!UtilController.isEmpty(sortField) && !UtilController.isEmpty(sortOrder)) {
        sort[sortField] = sortOrder === "false" ? -1 : 1;
      } else {
        sort["updatedAt"] = -1;
      }
      sort["createdAt"] = -1;
      const limit = parseInt(pageSize) || 10;
      const skip = parseInt(page) * limit || 0;
      const pipeline = [
        { $match: match },
        {
          $lookup: {
            from: "users",
            localField: "owner",
            foreignField: "_id",
            as: "owner",
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "operatedBy",
            foreignField: "_id",
            as: "operatedBy",
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "createdBy",
            foreignField: "_id",
            as: "createdBy",
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "updatedBy",
            foreignField: "_id",
            as: "updatedBy",
          },
        },
        { $unwind: { path: "$createdBy", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$operatedBy", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$updatedBy", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            name: 1,
            active: 1,
            count: { $size: "$owner" },
            updatedAt: 1,
            roleTagId: 1,
            createdAt: 1,
            createdBy: {
              $concat: [{ $ifNull: ["$createdBy.fname", ""] }, " ", { $ifNull: ["$createdBy.lname", ""] }],
            },
            operatedBy: {
              $concat: [{ $ifNull: ["$operatedBy.fname", ""] }, " ", { $ifNull: ["$operatedBy.lname", ""] }],
            },
            updatedBy: {
              $concat: [{ $ifNull: ["$updatedBy.fname", ""] }, " ", { $ifNull: ["$updatedBy.lname", ""] }],
            },
          },
        },
        {
          $facet: {
            totalCount: [{ $count: "count" }],
            data: [{ $sort: sort }, { $skip: skip }, { $limit: limit }],
          },
        },
      ];

      const roleResult = await Role.aggregate(pipeline);
      const rows = roleResult[0]?.data || [];
      const totalCount = roleResult[0]?.totalCount[0]?.count || 0;
      const pages = Math.ceil(totalCount / limit);

      UtilController.sendSuccess(req, res, next, {
        rows,
        pages,
        filterRecords: totalCount,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },

  queryTitle: async (req, res, next) => {
    try {
      let roles = await Role.find({ active: true }).select("name");

      UtilController.sendSuccess(req, res, next, {
        roles,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
  getRoleInfoById: async (req, res, next) => {
    try {
      const roleId = req.body.roleId;
      const role = await Role.findById(roleId)
        .populate({
          path: "owner",
          select: "fname lname mobileNo email position department profileImage",
        })
        .populate({
          path: "organizationId",
          select: "organizationName",
        })
        .select("-permission")
        .lean();

      let permissionArray = [];
      let roleAggregate = await Role.aggregate([
        {
          $match: {
            _id: mongoose.Types.ObjectId(roleId),
          },
        },
        {
          $unwind: {
            path: "$permission",
          },
        },
        {
          $group: {
            _id: "$permission.parentId",
            access: {
              $push: "$permission",
            },
          },
        },
      ]);

      for (let i = 0; i < roleAggregate.length; i++) {
        if (UtilController.isEmpty(roleAggregate[i]._id)) {
          for (let j = 0; j < roleAggregate[i].access.length; j++) {
            let parentPermission = roleAggregate[i].access[j];
            let childIndex = roleAggregate.findIndex(x => x._id === parentPermission.label);

            if (childIndex > -1) {
              let level2Array = [];
              for (let k = 0; k < roleAggregate[childIndex].access.length; k++) {
                let level2Permission = roleAggregate[childIndex].access[k];
                let level2Index = roleAggregate.findIndex(x => x._id === level2Permission.label);

                if (level2Index > -1) {
                  level2Permission["child"] = roleAggregate[level2Index].access;
                } else {
                  level2Permission["child"] = [];
                }
                level2Array.push(level2Permission);
              }
              parentPermission["child"] = level2Array;
            } else {
              parentPermission["child"] = [];
            }
            permissionArray.push(parentPermission);
          }
        }
      }

      role.permission = permissionArray;
      const userResult = await User.find({
        active: true,
        permission: {
          $elemMatch: { $eq: roleId },
        },
      });
      const admins = userResult.map(user => user._id);
      UtilController.sendSuccess(req, res, next, {
        role,
        admins,
      });
    } catch (err) {
      console.error("Error in getRoleInfoById:", err);
      UtilController.sendError(req, res, next, err);
    }
  },

  getRoleName: async (req, res, next) => {
    try {
      let queryObj = {
        active: true,
        owner: mongoose.Types.ObjectId(req.session.userId),
      };
      let activeRole = await Role.find(queryObj, "name");

      UtilController.sendSuccess(req, res, next, {
        activeRole,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
  createRole: async (req, res, next) => {
    try {
      let responseCode = returnCode.duplicate;
      let organization = null;
      let roleTagId = null;
      let organizationId = req.session.organizationId ?? req.body.organizationId;
      const roleExists = await Role.exists({
        $expr: {
          $eq: [{ $toLower: "$name" }, req.body.name.trim().toLowerCase()],
        },
        organizationId: organizationId,
        active: true,
      });

      if (roleExists) {
        return UtilController.sendError(req, res, next, {
          message: "Role already exists with name " + req.body.name + ".",
          responseCode: returnCode.duplicate,
        });
      }

      //for role tag id
      if (!UtilController.isEmpty(organizationId && !req.session.isSuperAdmin)) {
        organization = await Organizations.findById(organizationId).select(
          "organizationName employeePrefix employeeSequenceNo  _id",
        );
        if (!UtilController.isEmpty(organization)) {
          const updatedOrg = await Organizations.findByIdAndUpdate(
            organizationId,
            {
              $inc: { employeeSequenceNo: 1 },
              updatedAt: Math.floor(Date.now() / 1000),
            },
            { new: true },
          );

          if (!UtilController.isEmpty(updatedOrg.employeePrefix)) {
            roleTagId = updatedOrg.employeePrefix + UtilController.pad(updatedOrg.employeeSequenceNo ?? 0, 4);
          } else {
            console.warn("Employee prefix is empty. Falling back to Tag-based role ID generation.");

            let tagResult = await Tag.findOneAndUpdate(
              {
                active: true,
                tagType: "roles",
              },
              {
                $inc: { sequenceNo: 1 },
                updatedAt: Math.floor(Date.now() / 1000),
              },
              { new: true },
            );

            roleTagId = tagResult.prefix + UtilController.pad(tagResult.sequenceNo, 4);
          }
        } else {
          let tagResult = await Tag.findOneAndUpdate(
            {
              active: true,
              tagType: "roles",
            },
            {
              $inc: { sequenceNo: 1 },
              updatedAt: Math.floor(Date.now() / 1000),
            },
            { new: true },
          );

          roleTagId = tagResult.prefix + UtilController.pad(tagResult.sequenceNo, 4);
        }
      }

      if (!roleExists) {
        const addRoleData = {
          roleTagId,
          name: req.body.name,
          active: req.body.active,
          owner: req.body.owner ?? [],
          permission: req.body.permission,
          operatedBy: req.session.userId,
          createdBy: req.session.userId,
          organizationId: organizationId,
        };
        const createdRole = await Role.create(addRoleData);
        const owners = req.body.owner;
        const roleId = createdRole._id;
        const roleDetails = await Role.findById(roleId).populate("organizationId");
        if (!UtilController.isEmpty(owners)) {
          await Promise.all(
            owners.map(async ownerId => {
              const user = await User.findById(ownerId);

              if (user) {
                const updatedPermission = Array.isArray(user.permission) ? user.permission : [user.permission];
                if (!updatedPermission.includes(roleId)) {
                  updatedPermission.push(roleId);
                }
                await User.findByIdAndUpdate(ownerId, { $set: { permission: updatedPermission } }, { new: true });
              }
            }),
          );
        }

        responseCode = returnCode.validSession;

        await Notification.create({
          userId: req.session.userId,
          senderId: req.session.userId,
          title: `New Role Created`,
          body: `A new role ${createdRole?.name} has been created for the organization ${roleDetails?.organizationId?.organizationName} Click to view details`,
          type: "system",
          read: false,
          visibleOnHome: true,
          // actionUrl: `/security/role?id=${createdRole._id}`,
          actionUrl: `/security/role?id=${createdRole._id}`,
          recordId: createdRole._id,
          userType: "superAdmin",
        });

        await Notification.create({
          userId: req.session.userId,
          senderId: req.session.userId,
          organizationId: createdRole?.organizationId,
          title: `New Role Created`,
          body: `A new role ${createdRole?.name} has been created successfully. Click to manage permissions or assign it to users`,
          type: "system",
          read: false,
          visibleOnHome: true,
          actionUrl: `/security/role?id=${createdRole._id}`,
          recordId: createdRole._id,
          userType: "organizationAdmin",
        });
        await module.exports.helperFunctionForManager(roleDetails, createdRole, req);
        await module.exports.helperFunctionForEmployee(roleDetails, createdRole, req);
      }
      UtilController.sendSuccess(req, res, next, { responseCode });
    } catch (err) {
      console.error("Error creating role or updating users:", err);
      UtilController.sendError(req, res, next, err);
    }
  },

  helperFunctionForManager: async (roleDetails, createdRole, req) => {
    if (!roleDetails?.owner || !Array.isArray(roleDetails.owner)) {
      throw new Error("Invalid owner data");
    }

    for (const ownerId of roleDetails.owner) {
      try {
        const userDetails = await User.findById(ownerId);

        if (userDetails?.reportedTo) {
          const managerDetails = await User.findOne({ employeeIds: userDetails.reportedTo });

          if (managerDetails) {
            await Notification.create({
              userId: managerDetails._id,
              senderId: req.session.userId,
              title: `New Role Created`,
              body: `A new role ${createdRole?.name} has been created successfully. Click to manage permissions or assign it to users`,
              type: "system",
              read: false,
              visibleOnHome: true,
              actionUrl: `/security/role?id=${createdRole._id}`,
              recordId: createdRole._id,
              userType: "manager",
            });
          }
        }
      } catch (error) {
        console.error(`Error processing owner with ID ${ownerId}:`, error);
      }
    }
  },
  helperFunctionForEmployee: async (roleDetails, createdRole, req) => {
    if (!roleDetails?.owner || !Array.isArray(roleDetails.owner)) {
      throw new Error("Invalid owner data");
    }

    for (const ownerId of roleDetails.owner) {
      try {
        const userDetails = await User.findById(ownerId);

        if (userDetails) {
          await Notification.create({
            userId: userDetails._id,
            senderId: req.session.userId,
            title: `New Role Created`,
            body: `A new role ${createdRole?.name} has been created successfully. Click to manage permissions or assign it to users`,
            type: "system",
            read: false,
            visibleOnHome: true,
            // actionUrl: `/security/role?id=${createdRole._id}`,
            actionUrl: `/security/role?id=${createdRole._id}`,
            recordId: createdRole._id,
            userType: "employee",
          });
        }
      } catch (error) {
        console.error(`Error processing owner with ID ${ownerId}:`, error);
      }
    }
  },

  updateRolePermission: async (req, res, next) => {
    try {
      const roleId = mongoose.Types.ObjectId(req.body.roleId);
      const newOwners = req.body.owner || [];
      let organizationId = req.session.organizationId ?? req.body.organizationId;

      // Fetch old role data
      let oldResult = await Role.findById(roleId);

      const oldOwners = oldResult.owner || [];
      const oldPermissions = oldResult.permission || [];
      const newPermissions = req.body.permission || [];
      const hasPermissionChanged = JSON.stringify(oldPermissions) !== JSON.stringify(newPermissions);

      // Update Role
      await Role.findByIdAndUpdate(roleId, {
        permission: newPermissions,
        roleTagId: oldResult.roleTagId,
        name: req.body.name,
        active: req.body.active,
        organizationId: organizationId,
        owner: newOwners,
        operatedBy: req.session.userId,
        updatedAt: Math.floor(Date.now() / 1000),
        updatedBy: req.session.userId,
      });

      // Remove permissions for owners not in the new payload
      const removedOwners = oldOwners.filter(ownerId => !newOwners.includes(ownerId));
      await Promise.all(
        removedOwners.map(async ownerId => {
          await User.findByIdAndUpdate(ownerId, { $pull: { permission: roleId } }, { new: true });
        }),
      );

      // Add or update permissions for new owners
      await Promise.all(
        newOwners.map(async ownerId => {
          const user = await User.findById(ownerId);

          if (user) {
            // Ensure array & remove null/undefined
            let updatedPermission = Array.isArray(user.permission) ? user.permission.filter(Boolean) : [];

            // Convert all to string for safe compare
            const permissionIds = updatedPermission.map(p => p.toString());

            // Add roleId if not exists
            if (!permissionIds.includes(roleId.toString())) {
              updatedPermission.push(roleId);
            }

            await User.findByIdAndUpdate(ownerId, { $set: { permission: updatedPermission } }, { new: true });

            // Notification
            if (["Manager", "Employee"].includes(user.userType)) {
              const notification = {
                userType: user.userType,
                recordId: roleId,
                actionUrl: `/security/role?id=${roleId}`,
                userId: user._id,
                data: {},
                subject: "permission_changes_alert",
                notificationType: "inapp",
              };

              await NotificationController.sendInAppNotification(notification);
            }
          }
        }),
      );

      // Create Version Track for change history
      await VersionTrack.create({
        recordId: roleId,
        operatedBy: req.session.userId,
        data: oldResult,
      });

      UtilController.sendSuccess(req, res, next, {});
    } catch (err) {
      console.error("Error updating role permissions:", err);
      UtilController.sendError(req, res, next, err);
    }
  },

  getUnassigned: async (req, res, next) => {
    try {
      console.log("Fetching unassigned users...");

      let employees = await User.find({
        active: true,
      });

      let userResult = await User.find({
        active: true,
        permission: {
          $elemMatch: {
            roleId: req.body.roleId,
          },
        },
      });
      let admins = userResult.map(user => user._id);
      UtilController.sendSuccess(req, res, next, {
        employees,
        admins,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
  deleteRole: async (req, res, next) => {
    try {
      let recordIds = req.body.recordId;

      const response = await Role.updateMany({ _id: { $in: recordIds } }, { active: false }, { new: true });

      await User.updateMany({ permission: { $in: recordIds } }, { $pull: { permission: { $in: recordIds } } });

      UtilController.sendSuccess(req, res, next, {
        message: "Roles deactivated successfully and permissions updated",
        updatedCount: response.nModified,
      });
    } catch (err) {
      console.error("Error deleting role and updating user permissions:", err);
      UtilController.sendError(req, res, next, err);
    }
  },

  // grantRole: async (req, res, next) => {
  //   try {
  //     let roleId = req.body.roleId;
  //     let assign = req.body.assign;
  //     // console.log(assign)

  //     await Role.findByIdAndUpdate(roleId, {
  //       updatedAt: Math.floor(Date.now() / 1000),
  //     });

  //     let userResult = await User.find({
  //       permission: roleId,
  //     });
  //     let assignedEmp = [];
  //     for (var a = 0; a < userResult.length; a++) {
  //       assignedEmp.push(userResult[a]._id.toString());
  //     }
  //     let grantPermission = assign.filter(x => !assignedEmp.includes(x));
  //     let removePermission = assignedEmp.filter(x => !assign.includes(x));
  //     // added permission
  //     for (var i = 0; i < grantPermission.length; i++) {
  //       module.exports.updateEmployeePermission(grantPermission[i], roleId);
  //     }
  //     // remove permission
  //     for (var j = 0; j < removePermission.length; j++) {
  //       module.exports.updateEmployeePermission(removePermission[j], null);
  //     }
  //     UtilController.sendSuccess(req, res, next, {});
  //   } catch (err) {
  //     console.log(err);
  //     UtilController.sendError(req, res, next, err);
  //   }
  // },
  grantRole: async (req, res, next) => {
    try {
      const roleId = req.body.roleId;
      const assign = req.body.assign;
      const timestamp = Math.floor(Date.now() / 1000);
      await Role.findByIdAndUpdate(roleId, { updatedAt: timestamp });
      const grantPromises = assign.map(empId =>
        User.findByIdAndUpdate(empId, { $addToSet: { permission: roleId } }, { new: true }),
      );
      await Promise.all(grantPromises);
      UtilController.sendSuccess(req, res, next, {});
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },

  updateEmployeePermission: async (empId, roleId) => {
    try {
      await User.findByIdAndUpdate(
        empId,
        {
          $addToSet: { permission: roleId },
        },
        { new: true },
      );
    } catch (err) {
      console.error("Error updating employee permission:", err);
    }
  },

  // API to get all users for dropdown selection with search keyword
  queryCreatedByUsers: async (req, res, next) => {
    try {
      const { keyword } = req.query;
      let organizationId = req.session.organizationId;
      let match = {};

      if (!UtilController.isEmpty(organizationId)) {
        match["organizationId"] = mongoose.Types.ObjectId(organizationId);
      }
      const pipeline = [
        { $match: match },
        {
          $lookup: {
            from: "users",
            localField: "createdBy",
            foreignField: "_id",
            as: "createdByUser",
          },
        },
        {
          $unwind: {
            path: "$createdByUser",
            preserveNullAndEmptyArrays: false,
          },
        },
        {
          $group: {
            _id: "$createdByUser._id",
            fname: { $first: "$createdByUser.fname" },
            lname: { $first: "$createdByUser.lname" },
          },
        },
        ...(keyword
          ? [
              {
                $match: {
                  $or: [{ fname: { $regex: keyword, $options: "i" } }, { lname: { $regex: keyword, $options: "i" } }],
                },
              },
            ]
          : []),
        {
          $sort: { fname: 1 },
        },
        {
          $project: {
            _id: 1,
            fname: 1,
            lname: 1,
          },
        },
      ];
      let result = await Role.aggregate(pipeline);
      UtilController.sendSuccess(req, res, next, {
        result,
      });
    } catch (err) {
      console.error(err);
      UtilController.sendError(req, res, next, err);
    }
  },
  rolesConfigureList: async (req, res, next) => {
    try {
      UtilController.sendSuccess(req, res, next, {
        permission,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },

  getRolePermission: async (req, res, next) => {
    try {
      let organizationId = req.session.organizationId;

      let match = { active: true };
      if (!UtilController.isEmpty(organizationId)) {
        match["organizationId"] = mongoose.Types.ObjectId(organizationId);
      }

      const pipeline = [
        { $match: match },
        {
          $project: {
            _id: 1,
            name: 1,
            active: 1,
            permission: 1,
            organizationId: 1,
          },
        },
      ];

      const roleResult = await Role.aggregate(pipeline);
      UtilController.sendSuccess(req, res, next, {
        roleResult,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },

  rolesDropdown: async (req, res, next) => {
    try {
      const { keyword } = req.body;
      const isActive = true; // Always querying for active roles

      let organizationId = req.body.organizationId || req.session.organizationId;

      // Match conditions
      let match = { active: isActive };
      if (!UtilController.isEmpty(keyword)) {
        match["name"] = { $regex: keyword, $options: "i" };
      }
      if (!UtilController.isEmpty(organizationId)) {
        match["organizationId"] = mongoose.Types.ObjectId(organizationId);
      }

      // Simplified pipeline
      const pipeline = [
        { $match: match },
        {
          $project: {
            _id: 1,
            name: 1,
            active: 1,
            updatedAt: 1,
            createdAt: 1,
          },
        },
      ];

      const roleResult = await Role.aggregate(pipeline);

      UtilController.sendSuccess(req, res, next, {
        rows: roleResult, // Return the matched roles
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
  rolePermissionDashboard: async (req, res, next) => {
    try {
      const { keyword } = req.body;

      let organizationId = req.body.organizationId || req.session.organizationId;

      const userType = (req.session.userType || "").toLowerCase();

      // Match conditions
      let match = { active: true };

      if (userType !== "superAdmin") {
        if (!UtilController.isEmpty(organizationId)) {
          match["organizationId"] = mongoose.Types.ObjectId(organizationId);
        }
      }

      const totalRoles = await Role.count({ ...match });
      const activeUsers = await User.count({ ...match });

      const superAdmin = await User.count({ ...match, userType: "superAdmin" });
      const Admin = await User.count({ ...match, userType: "Admin" });
      const Manager = await User.count({ ...match, userType: "Manager" });
      const Employee = await User.count({ ...match, userType: "Employee" });

      const startOfDay = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
      const endOfDay = Math.floor(new Date().setHours(23, 59, 59, 999) / 1000);

      const recentChanges = await Role.count({
        ...match,
        updatedAt: {
          $gte: startOfDay,
          $lte: endOfDay,
        },
      });

      UtilController.sendSuccess(req, res, next, {
        rolePermissionManagement: [
          {
            totalRoles: totalRoles, // Return the matched roles
            activeUsers: activeUsers,
            totalPermissions: permission.length,
            recentChanges: recentChanges,
          },
        ],
        userDistribution: [
          {
            superAdmin: superAdmin,
            Admin: Admin,
            Manager: Manager,
            Employee: Employee,
          },
        ],
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
};
