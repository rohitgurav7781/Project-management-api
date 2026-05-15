const mongoose = require("mongoose");
const Department = require("../../models/Department");
const DepartmentLog = require("../../models/DepartmentLog");
const Tag = require("../../models/Tag");
const returnCode = require("../../../config/responseCode").returnCode;
const UtilController = require("./../services/UtilController");
const User = require("../../models/User");
const NotificationController = require("../services/NotificationController");
const Notification = require("../../models/Notification");

const createDepartmentLog = async (
  departmentId,
  parentDepartmentId,
  action,
  // createdBy,
) => {
  await DepartmentLog.create({
    departmentId,
    parentDepartmentId,
    action,
    // createdBy,
  });
};

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
  // createDepartment: async (req, res, next) => {
  //   try {
  //     let requiredFields = ["name"];

  //     if (req.session.isSuperAdmin) {
  //       requiredFields.push("organizationId");
  //     }

  //     let validationErrors = UtilController.validateRequiredFields(req.body, requiredFields);

  //     if (validationErrors.length > 0) {
  //       return UtilController.sendError(req, res, next, {
  //         message: "Validation errors occurred.",
  //         errors: validationErrors,
  //         responseCode: returnCode.incompleteBody,
  //       });
  //     }

  //     validationErrors = validateStrings(req.body, requiredFields);

  //     if (validationErrors.length > 0) {
  //       return UtilController.sendError(req, res, next, {
  //         message: "Validation errors occurred.",
  //         errors: validationErrors,
  //         responseCode: returnCode.incompleteBody,
  //       });
  //     }

  //     const { name, head, description, location, phone, isParent = true, parentDepartment, logo = "" } = req.body;
  //     const userId = req.session.userId;
  //     let organizationId;

  //     if (req.session.isSuperAdmin) {
  //       organizationId = req.body.organizationId;
  //     } else {
  //       organizationId = req.session.organizationId;
  //     }

  //     const tagResult = await Tag.findOneAndUpdate(
  //       {
  //         active: true,
  //         tagType: "department",
  //       },
  //       {
  //         $inc: { sequenceNo: 1 },
  //         updatedAt: Math.floor(Date.now() / 1000),
  //       },
  //     );
  //     const departmentId = tagResult.prefix + UtilController.pad(tagResult.sequenceNo, 4);

  //     const headExists = await User.findById(head);

  //     if (!headExists) {
  //       return UtilController.sendError(req, res, next, {
  //         message: "Head user not found",
  //         responseCode: returnCode.recordNotFound,
  //       });
  //     }

  //     //TODO: Organization validation

  //     if (!isParent) {
  //       if (!parentDepartment) {
  //         return UtilController.sendError(req, res, next, {
  //           message: "Parent department is required",
  //           responseCode: returnCode.incompleteBody,
  //         });
  //       }

  //       const parentDepartmentExists = await Department.findById(parentDepartment);
  //       if (!parentDepartmentExists) {
  //         return UtilController.sendError(req, res, next, {
  //           message: "Parent department not found",
  //           responseCode: returnCode.recordNotFound,
  //         });
  //       }

  //       const department = new Department({
  //         organizationId: mongoose.Types.ObjectId(organizationId),
  //         departmentId,
  //         name,
  //         head,
  //         description,
  //         location,
  //         phone,
  //         isParent,
  //         logo,
  //         parentDepartment: mongoose.Types.ObjectId(parentDepartment),
  //         createdBy: mongoose.Types.ObjectId(userId),
  //       });

  //       const result = await department.save();

  //       await User.findByIdAndUpdate(head, {
  //         $set: {
  //           departmentId: result._id,
  //         },
  //       });

  //       return UtilController.sendSuccess(req, res, next, {
  //         message: "Department created successfully",
  //         department: result,
  //       });
  //     }

  //     const department = new Department({
  //       organizationId: mongoose.Types.ObjectId(organizationId),
  //       departmentId,
  //       name,
  //       head,
  //       description,
  //       location,
  //       phone,
  //       isParent,
  //       logo,
  //       createdBy: mongoose.Types.ObjectId(userId),
  //     });

  //     const result = await department.save();

  //     await User.findByIdAndUpdate(head, {
  //       $set: {
  //         departmentId: result._id,
  //       },
  //     });

  //     return UtilController.sendSuccess(req, res, next, {
  //       message: "Department created successfully",
  //       department: result,
  //     });
  //   } catch (error) {
  //     return UtilController.sendError(req, res, next, error);
  //   }
  // },

  createDepartment: async (req, res, next) => {
    try {
      let requiredFields = ["name"];

      if (req.session.isSuperAdmin) {
        requiredFields.push("organizationId");
      }

      // Validate required fields
      let validationErrors = UtilController.validateRequiredFields(req.body, requiredFields);
      if (validationErrors.length > 0) {
        return UtilController.sendError(req, res, next, {
          message: "Validation errors occurred.",
          errors: validationErrors,
          responseCode: returnCode.incompleteBody,
        });
      }

      // Additional validation for string fields
      validationErrors = validateStrings(req.body, requiredFields);
      if (validationErrors.length > 0) {
        return UtilController.sendError(req, res, next, {
          message: "Validation errors occurred.",
          errors: validationErrors,
          responseCode: returnCode.incompleteBody,
        });
      }

      const {
        name,
        head,
        description,
        location,
        phone,
        isParent = true,
        parentDepartment,
        logo = "",
        attachment,
        note,
      } = req.body;

      const existingDepartment = await Department.findOne({
        active: true, //throw error if duplicate is in active but not in inactive
        $expr: { $eq: [{ $toLower: "$name" }, name.toLowerCase()] }, // Case-insensitive exact match
        organizationId: mongoose.Types.ObjectId(req.session.organizationId),
      });

      if (existingDepartment) {
        return UtilController.sendError(req, res, next, {
          message: "A department with the same name already exists.",
          responseCode: returnCode.duplicate,
        });
      }

      const userId = req.session.userId;
      let organizationId = req.session.isSuperAdmin ? req.body.organizationId : req.session.organizationId;

      // Generate a unique department ID
      const tagResult = await Tag.findOneAndUpdate(
        { active: true, tagType: "department" },
        { $inc: { sequenceNo: 1 }, updatedAt: Math.floor(Date.now() / 1000) },
      );

      const departmentId = tagResult.prefix + UtilController.pad(tagResult.sequenceNo, 4);

      // Validate `head` field if provided
      let headExists = null;
      if (head) {
        if (!mongoose.Types.ObjectId.isValid(head)) {
          return UtilController.sendError(req, res, next, {
            message: "Invalid head ID provided.",
            responseCode: returnCode.incompleteBody,
          });
        }

        headExists = await User.findById(head);
        if (!headExists) {
          return UtilController.sendError(req, res, next, {
            message: "Head user not found.",
            responseCode: returnCode.recordNotFound,
          });
        }
      }

      // If the department is not a parent, validate `parentDepartment`
      if (!isParent) {
        if (!parentDepartment) {
          return UtilController.sendError(req, res, next, {
            message: "Parent department is required.",
            responseCode: returnCode.incompleteBody,
          });
        }

        const parentDepartmentExists = await Department.findById(parentDepartment);
        if (!parentDepartmentExists) {
          return UtilController.sendError(req, res, next, {
            message: "Parent department not found.",
            responseCode: returnCode.recordNotFound,
          });
        }
      }

      // Prepare department data
      const departmentData = {
        organizationId: mongoose.Types.ObjectId(organizationId),
        departmentId,
        name,
        description,
        location,
        phone,
        isParent,
        logo,
        attachment,
        note,
        createdBy: mongoose.Types.ObjectId(userId),
        updatedBy: mongoose.Types.ObjectId(userId),
      };

      if (headExists) {
        departmentData.head = head; // Add `head` only if valid
      }

      if (!isParent) {
        departmentData.parentDepartment = mongoose.Types.ObjectId(parentDepartment);
      }

      // Create department
      const department = new Department(departmentData);
      const result = await department.save();

      // Update the head's departmentId only if `head` exists
      if (headExists) {
        await User.findByIdAndUpdate(head, {
          $set: { departmentId: result._id },
        });
      }
      //sending notification to organization admin

      await Notification.create({
        userType: "organizationAdmin",
        recordId: result?._id,
        userId: req.session.userId,
        title: `New Department Created`,
        organizationId: result?.organizationId,
        body: `The department ${result?.name} has been successfully created. Click to view details.`,
        type: "system",
        read: false,
        visibleOnHome: true,
        actionUrl: `/department?id=${result._id}`,
      });

      // Send success response
      return UtilController.sendSuccess(req, res, next, {
        message: "Department created successfully.",
        department: result,
      });
    } catch (error) {
      // Handle errors
      return UtilController.sendError(req, res, next, error);
    }
  },

  getAllDepartments: async (req, res, next) => {
    try {
      const {
        keyword,
        page = 0,
        pageSize = 10,
        sortBy = "createdAt",
        order = "desc",
        status = "active",
        organizationId,
        createdBy,
        updatedBy,
        startDate,
        endDate,
      } = req.body;

      const userOrganization = req.session.organizationId;

      const parsedPage = parseInt(page, 10);
      const parsedLimit = parseInt(pageSize, 10);

      if (isNaN(parsedPage) || isNaN(parsedLimit) || parsedPage < 0 || parsedLimit < 1) {
        return UtilController.sendError(req, res, next, "Invalid page or limit");
      }

      // const skip = parsedPage > 0 ? (parsedPage - 1) * parsedLimit : 0;
      const skip = parsedPage * parsedLimit;

      const initialMatch = {
        active: status === "active",
      };

      if (!UtilController.isEmpty(userOrganization)) {
        initialMatch.organizationId = mongoose.Types.ObjectId(userOrganization);
      }

      if (!UtilController.isEmpty(organizationId)) {
        initialMatch.organizationId = mongoose.Types.ObjectId(organizationId);
      }

      if (createdBy) {
        initialMatch.createdBy = mongoose.Types.ObjectId(createdBy);
      }

      if (updatedBy) {
        initialMatch.updatedBy = mongoose.Types.ObjectId(updatedBy);
      }
      console.log("initialMatch", JSON.stringify(initialMatch));
      const pipeline = [
        {
          $match: initialMatch,
        },
        {
          $lookup: {
            from: "organizations",
            localField: "organizationId",
            foreignField: "_id",
            as: "organization",
          },
        },
        {
          $unwind: {
            path: "$organization",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "head",
            foreignField: "_id",
            as: "head",
          },
        },
        {
          $unwind: {
            path: "$head",
            preserveNullAndEmptyArrays: true,
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
          $unwind: {
            path: "$createdBy",
            preserveNullAndEmptyArrays: true,
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
        {
          $unwind: {
            path: "$updatedBy",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "users",
            let: { deptId: "$departmentId" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [{ $eq: ["$departmentId", "$$deptId"] }, { $eq: ["$active", true] }],
                  },
                },
              },
              {
                $count: "total",
              },
            ],
            as: "employeeCount",
          },
        },
        {
          $addFields: {
            employeeCount: {
              $ifNull: [{ $arrayElemAt: ["$employeeCount.total", 0] }, 0],
            },
          },
        },
      ];

      if (keyword) {
        pipeline.push({
          $match: {
            $or: [
              { name: { $regex: keyword, $options: "i" } },
              { departmentId: { $regex: keyword, $options: "i" } },
              { "organization.organizationName": { $regex: keyword, $options: "i" } },
              { "head.fname": { $regex: keyword, $options: "i" } },
              { "head.lname": { $regex: keyword, $options: "i" } },
              { "createdBy.fname": { $regex: keyword, $options: "i" } },
              { "createdBy.lname": { $regex: keyword, $options: "i" } },
            ],
          },
        });
      }

      if (startDate && endDate) {
        pipeline.push({
          $match: {
            createdAt: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        });
      }

      pipeline.push({
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $sort: { [sortBy]: order === "desc" ? -1 : 1 } },
            { $skip: skip },
            { $limit: parsedLimit },
            {
              $project: {
                _id: 1,
                name: 1,
                logo: 1,
                departmentId: 1,
                head: 1,
                description: 1,
                location: 1,
                phone: 1,
                attachment: 1,
                note: 1,
                isParent: 1,
                parentDepartment: 1,
                createdAt: 1,
                createdBy: {
                  $concat: [{ $ifNull: ["$createdBy.fname", ""] }, " ", { $ifNull: ["$createdBy.lname", ""] }],
                },
                updatedBy: {
                  $concat: [{ $ifNull: ["$updatedBy.fname", ""] }, " ", { $ifNull: ["$updatedBy.lname", ""] }],
                },
                createdAt: 1,
                updatedAt: 1,
                head: {
                  $concat: [{ $ifNull: ["$head.fname", ""] }, " ", { $ifNull: ["$head.lname", ""] }],
                },
                departmentHeadProfile: "$head.profileImage",
                organization: "$organization.organizationName",
                employeeCount: 1,
              },
            },
          ],
        },
      });

      const [result] = await Department.aggregate(pipeline);

      const total = result.metadata[0]?.total || 0;
      const totalPages = Math.ceil(total / parsedLimit);

      return UtilController.sendSuccess(req, res, next, {
        rows: result.data,
        pages: parsedPage,
        filterRecords: total,
        responseCode: returnCode.validSession,
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },
  getDepartmentDropdown: async (req, res, next) => {
    try {
      const { keyword, page = 1, limit = 10 } = req.body;
      let organization = req.body.organizationId || req.session.organizationId;

      if (isNaN(page) || isNaN(limit) || page < 1 || limit < 1) {
        return UtilController.sendError(req, res, next, "Invalid page or limit");
      }

      const match = {
        active: true,
      };
      if (!UtilController.isEmpty(organization)) {
        match.organizationId = mongoose.Types.ObjectId(organization);
      }

      if (keyword) {
        match.$or = [
          { name: { $regex: keyword, $options: "i" } },
          { departmentId: { $regex: keyword, $options: "i" } },
        ];
      }

      const skip = (page - 1) * limit;

      const departments = await Department.aggregate([
        { $match: match },
        {
          $project: {
            name: 1,
            departmentId: 1,
            _id: 1,
          },
        },
        {
          $facet: {
            totalDepartments: [{ $count: "count" }],
            departments: [{ $skip: skip }, { $limit: limit }],
          },
        },
      ]);

      const totalDepartments = departments[0].totalDepartments[0]?.count || 0;
      const data = departments[0].departments || [];

      return UtilController.sendSuccess(req, res, next, {
        message: "Departments found successfully",
        data,
        filteredRecords: totalDepartments,
        pages: Math.ceil(totalDepartments / limit),
        currentPage: page,
        pageSize: limit,
      });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },

  getDepartmentById: async (req, res, next) => {
    try {
      const recordId = req.body.recordId;
      let organizationId;
      if (!req.session.isSuperAdmin) {
        organizationId = req.session.organizationId;
      }

      if (!recordId) {
        return UtilController.sendError(req, res, next, {
          message: "Invalid department id",
          responseCode: returnCode.incompleteBody,
        });
      }

      let matchStage = {
        _id: mongoose.Types.ObjectId(recordId),
        active: true,
      };

      if (organizationId) {
        matchStage.organizationId = mongoose.Types.ObjectId(organizationId);
      }

      const pipeline = [
        {
          $match: matchStage,
        },
        {
          $lookup: {
            from: "users",
            localField: "head",
            foreignField: "_id",
            as: "head",
          },
        },
        {
          $unwind: {
            path: "$head",
            preserveNullAndEmptyArrays: true,
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
          $unwind: {
            path: "$createdBy",
            preserveNullAndEmptyArrays: true,
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
        {
          $unwind: {
            path: "$updatedBy",
            preserveNullAndEmptyArrays: true,
          },
        },

        {
          $lookup: {
            from: "organizations",
            localField: "organizationId",
            foreignField: "_id",
            as: "organization",
          },
        },
        {
          $unwind: {
            path: "$organization",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "users",
            let: { deptId: "$departmentId" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [{ $eq: ["$departmentId", "$$deptId"] }, { $eq: ["$active", true] }],
                  },
                },
              },
              {
                $count: "total",
              },
            ],
            as: "employeeCount",
          },
        },
        {
          $addFields: {
            employeeCount: {
              $ifNull: [{ $arrayElemAt: ["$employeeCount.total", 0] }, 0],
            },
          },
        },
        {
          $project: {
            _id: 1,
            name: 1,
            departmentId: 1,
            // head: 1,
            description: 1,
            location: 1,
            phone: 1,
            isParent: 1,
            parentDepartment: 1,
            createdAt: 1,
            updatedAt: 1,
            organization: 1,
            logo: 1,
            attachment: 1,
            note: 1,
            employeeCount: 1,
            createdBy: {
              $concat: [{ $ifNull: ["$createdBy.fname", ""] }, " ", { $ifNull: ["$createdBy.lname", ""] }],
            },
            updatedBy: {
              $concat: [{ $ifNull: ["$updatedBy.fname", ""] }, " ", { $ifNull: ["$updatedBy.lname", ""] }],
            },
            head: {
              name: {
                $concat: [{ $ifNull: ["$head.fname", ""] }, " ", { $ifNull: ["$head.lname", ""] }],
              },
              _id: "$head._id",
              profileImage: "$head.profileImage",
            },
            departmentHeadProfile: "$head.profileImage",
            organization: {
              name: "$organization.organizationName",
              _id: "$organization._id",
            },
          },
        },
      ];

      const [result] = await Department.aggregate(pipeline);

      return UtilController.sendSuccess(req, res, next, {
        data: result,
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },
  updateDepartment: async (req, res, next) => {
    try {
      const { recordId, name, head, departmentId, description, location, phone, logo, attachment, note } = req.body;
      const userId = req.session.userId;

      if (!recordId || !mongoose.Types.ObjectId.isValid(recordId)) {
        return UtilController.sendError(req, res, next, {
          message: "Invalid department id",
          responseCode: returnCode.incompleteBody,
        });
      }

      const department = await Department.findOne({ _id: recordId, active: true });

      if (!department) {
        return UtilController.sendError(req, res, next, {
          message: "Department not found",
          responseCode: returnCode.recordNotFound,
        });
      }

      const updateObj = {
        ...(name && { name }),
        ...(departmentId && { departmentId }),
        ...(description && { description }),
        ...(location && { location }),
        ...(phone && { phone }),
        ...(logo && { logo }),
        ...(attachment && { attachment }),
        ...(note && { note }),
        updatedAt: Math.floor(Date.now() / 1000),
        updatedBy: mongoose.Types.ObjectId(userId),
      };

      if (head) {
        const newHead = await User.findOne({ _id: head, active: true });
        if (!newHead) {
          return UtilController.sendError(req, res, next, {
            message: "Head user not found",
            responseCode: returnCode.recordNotFound,
          });
        }

        updateObj.head = head;

        await Promise.all([
          department.head && User.findByIdAndUpdate(department.head, { $unset: { departmentId: 1 } }),
          User.findByIdAndUpdate(head, { $set: { departmentId: department._id } }),
        ]);
      }

      if (Object.keys(updateObj).length <= 2) {
        return UtilController.sendSuccess(req, res, next, { data: department });
      }

      const updatedDepartment = await Department.findByIdAndUpdate(recordId, updateObj, { new: true });

      return UtilController.sendSuccess(req, res, next, {
        data: updatedDepartment,
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    } finally {
    }
  },
  getDepartmentEmployeeCount: async (req, res, next) => {
    try {
      const recordId = req.body.recordId;

      const pipeline = [
        {
          $match: {
            _id: mongoose.Types.ObjectId(recordId),
            active: true,
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "departmentId",
            foreignField: "departmentId",
            as: "users",
          },
        },
        {
          $project: {
            count: { $size: "$users" },
          },
        },
      ];

      const [department] = await Department.aggregate(pipeline);
      const count = department ? department.count : 0;

      return UtilController.sendSuccess(req, res, next, {
        count,
        responseCode: returnCode.validSession,
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },
  deleteDepartment: async (req, res, next) => {
    try {
      const { recordId } = req.body;
      const userId = req.session.userId;

      if (!recordId || !mongoose.Types.ObjectId.isValid(recordId)) {
        return UtilController.sendError(req, res, next, {
          responseCode: returnCode.incompleteBody,
          message: "Invalid department id",
        });
      }

      const departments = await Department.find({
        $or: [
          { _id: mongoose.Types.ObjectId(recordId), active: true },
          { parentDepartment: mongoose.Types.ObjectId(recordId), active: true },
        ],
      }).select("_id");

      if (departments.length === 0 || !departments.some(dept => dept._id.equals(recordId))) {
        return UtilController.sendError(req, res, next, {
          responseCode: returnCode.recordNotFound,
          message: "Department not found",
        });
      }

      const allDepartmentIds = departments.map(dept => dept._id);

      const usersCount = await User.countDocuments({
        departmentId: { $in: allDepartmentIds },
        active: true,
      });

      if (usersCount > 0) {
        return UtilController.sendError(req, res, next, {
          responseCode: returnCode.notAllowed,
          message: "Cannot delete department until all users have been reassigned to another department",
        });
      }

      const currentTime = Math.floor(Date.now() / 1000);

      await Department.updateMany(
        { _id: { $in: allDepartmentIds } },
        {
          active: false,
          updatedAt: currentTime,
          updatedBy: mongoose.Types.ObjectId(userId),
        },
      );

      return UtilController.sendSuccess(req, res, next, {
        message: "Department and associated sub-departments deleted successfully",
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },
  // API to get all users for dropdown selection with search keyword
  queryCreatedByDepartment: async (req, res, next) => {
    try {
      // Extract search keyword from request query
      const { keyword } = req.query;
      const { organizationId } = req.session;

      // Aggregate pipeline to get distinct createdBy users
      const pipeline = [
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
        // Add match stage for organizationId
        {
          $match: {
            organizationId: mongoose.Types.ObjectId(organizationId),
          },
        },
        {
          $group: {
            _id: "$createdByUser._id",
            fname: { $first: "$createdByUser.fname" },
            lname: { $first: "$createdByUser.lname" },
          },
        },
        // Add a match stage for filtering based on keyword
        ...(keyword
          ? [
              {
                $match: {
                  $or: [
                    { fname: { $regex: keyword, $options: "i" } }, // Match first name
                    { lname: { $regex: keyword, $options: "i" } }, // Match last name
                  ],
                },
              },
            ]
          : []), // Skip match if no keyword is provided
        {
          $sort: { fname: 1 }, // Sort by first name
        },
        {
          $project: {
            _id: 1, // User ID
            fname: 1, // First Name
            lname: 1, // Last Name
          },
        },
      ];

      // Fetch results
      let result = await Department.aggregate(pipeline);

      // Send success response
      UtilController.sendSuccess(req, res, next, {
        result,
      });
    } catch (err) {
      console.error(err);
      UtilController.sendError(req, res, next, err);
    }
  },
};
