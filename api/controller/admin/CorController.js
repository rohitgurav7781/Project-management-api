let request = require("request");
let mongoose = require("mongoose");
const CORs = require("../../models/Cor");
const { parsePhoneNumberFromString } = require("libphonenumber-js");
const UtilController = require("../services/UtilController");
const returnCode = require("../../../config/responseCode").returnCode;

module.exports = {
  createCors: async (req, res) => {
    // console.log("createCors", req.user);
    try {
      const {
        customerId,
        projectId,
        projectName,
        customerName,
        corApprovedDate,
        corAmount,
        revisedPOAmount,
        coPo,
        poId,
        poNumber,
        designedCor,
        detailingCor,
        attachment,
        note,
        status,
        progress,
      } = req.body;

      if (UtilController.isEmpty(req.session.organizationId)) throw { message: "Organization Id is required" };
      const newCors = new CORs({
        corNumber: UtilController.generateUniqueNumber(10), // Implement a function to generate unique quote numbers
        customerId,
        organizationId: req.session.organizationId,
        projectId,
        customerName,
        projectName,
        corApprovedDate,
        corAmount,
        revisedPOAmount,
        status: status || "pending",
        progress: progress || 0,
        coPo,
        poId,
        poNumber,
        designedCor,
        detailingCor,
        attachment,
        note,
        //createdBy: req.user._id,
      });

      const savedCors = await newCors.save();
      console.log("savedCors", savedCors);
      res.status(201).json({ message: "Cors created successfully", data: savedCors });
    } catch (error) {
      res.status(500).json({ message: "Error creating Cors", error: error.message });
    }
  },

  duplicateCors: async (req, res) => {
    try {
      const { corId } = req.params;
      const existingCOR = await CORs.findById(corId);
      if (!existingCOR) {
        return res.status(404).json({ message: "COR not found" });
      }

      const newCOR = new CORs({
        ...existingCOR.toObject(),
        _id: mongoose.Types.ObjectId(), // Creating a new unique ID for the duplicated COR
        corNumber: UtilController.generateUniqueNumber(10),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: "COR Created",
      });

      const duplicatedCor = await newCOR.save();
      res.status(201).json({ message: "COR duplicated successfully", data: duplicatedCor });
    } catch (error) {
      res.status(500).json({ message: "Error duplicating COR", error: error.message });
    }
  },
  deleteCors: async (req, res, next) => {
    try {
      let corId = req.body.recordId;

      await CORs.updateMany(
        { _id: { $in: corId } },
        {
          $set: {
            active: false,
            //  operatedBy: req.session.userId,
            updatedAt: Math.floor(Date.now() / 1000),
          },
        },
        { new: true },
      );

      UtilController.sendSuccess(req, res, next, {
        message: "Cors deleted successfully",
      });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },
  getCorById: async (req, res, next) => {
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
            from: "customers",
            localField: "customerId",
            foreignField: "_id",
            as: "customer",
          },
        },
        {
          $unwind: {
            path: "$customers",
            preserveNullAndEmptyArrays: true,
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
          $project: {
            _id: 1,
            revisedPOAmount: 1,
            corAmount: 1,
            corNumber: 1,
            coPo: 1,
            poId: 1,
            poNumber: 1,
            designedCor: 1,
            detailingCor: 1,
            attachment: 1,
            note: 1,
            status: "$status",
            progress: 1,
            // name: 1,
            // corId: 1,
            project: 1,
            customer: 1,

            //description: 1,
            // location: 1,
            // phone: 1,
            // isParent: 1,
            //  parentDepartment: 1,
            createdAt: 1,
            updatedAt: 1,
            organization: 1,
            // logo: 1,
            // createdBy: {
            //   $concat: [{ $ifNull: ["$createdBy.fname", ""] }, " ", { $ifNull: ["$createdBy.lname", ""] }],
            // },
            // head: {
            //   name: {
            //     $concat: [{ $ifNull: ["$head.fname", ""] }, " ", { $ifNull: ["$head.lname", ""] }],
            //   },
            //   _id: "$head._id",
            // },
            organization: {
              name: "$organization.organizationName",
              _id: "$organization._id",
            },
            corApprovedDate: 1,
          },
        },
      ];

      const [result] = await CORs.aggregate(pipeline);
      console.log("result", result);
      return UtilController.sendSuccess(req, res, next, {
        data: result,
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },
  updateCors: async (req, res, next) => {
    try {
      const updateObj = req.body;

      if (!updateObj.corId) {
        UtilController.sendError(req, res, next, {
          responseCode: returnCode.incompleteBody,
          message: "corId is required.",
        });
        return;
      }

      if (updateObj.poId !== undefined && UtilController.isEmpty(updateObj.poId)) {
        UtilController.sendError(req, res, next, {
          responseCode: returnCode.incompleteBody,
          message: "PO ID cannot be empty.",
        });
        return;
      }

      if (updateObj.poNumber !== undefined && UtilController.isEmpty(updateObj.poNumber)) {
        UtilController.sendError(req, res, next, {
          responseCode: returnCode.incompleteBody,
          message: "PO Number cannot be empty.",
        });
        return;
      }

      // Add fields for operation tracking
      updateObj["operatedBy"] = req.session.userId;
      updateObj["updatedAt"] = Math.floor(Date.now() / 1000);

      // Find the cor by corId and update it
      const cor = await CORs.findByIdAndUpdate(updateObj.corId, updateObj, { new: true });

      // If the cor is not found, send a 'not found' response
      if (!cor) {
        UtilController.sendError(req, res, next, {
          responseCode: returnCode.recordNotFound,
          message: "cor not found or update failed.",
        });
        return;
      }

      // Send success response with updated cor data
      UtilController.sendSuccess(req, res, next, {
        message: "cor updated successfully.",
        cor,
        responseCode: returnCode.validSession,
      });
    } catch (error) {
      console.error("Error updating cor:", error);
      UtilController.sendError(req, res, next, {
        message: "An error occurred while updating the cor.",
        error: error.message,
        responseCode: returnCode.errror,
      });
    }
  },
  listCors: async (req, res, next) => {
    try {
      //apply sort, search, pagination
      let search = {};
      let userId = req.session.userId;
      let userType = req.session.userType;
      if (!UtilController.isEmpty(req.body.keyword)) {
        search["$or"] = [
          // { "scuId.title": { $regex: req.body.keyword, $options: "i" } },
          { customerName: { $regex: req.body.keyword, $options: "i" } },
          { corNumber: { $regex: req.body.keyword, $options: "i" } },
          { projectName: { $regex: req.body.keyword, $options: "i" } },
          { poNumber: { $regex: req.body.keyword, $options: "i" } },
        ];
      }

      let match = {
        active: true,
      };
      if (!UtilController.isEmpty(req.session.organizationId))
        match["organizationId"] = mongoose.Types.ObjectId(req.session.organizationId);
      if (!UtilController.isEmpty(req.body.active)) match["active"] = req.body.active;

      if (!UtilController.isEmpty(req.body.customerName))
        match["customerName"] = mongoose.Types.ObjectId(req.body.customerName);

      if (!UtilController.isEmpty(req.body.startDate) || !UtilController.isEmpty(req.body.endDate)) {
        match["$and"] = [];
        if (!UtilController.isEmpty(req.body.startDate))
          match["$and"].push({ corApprovedDate: { $gte: req.body.startDate } });

        if (!UtilController.isEmpty(req.body.endDate))
          match["$and"].push({ corApprovedDate: { $lte: req.body.endDate } });
      }

      let sort = {};
      if (!UtilController.isEmpty(req.body.sortField) && !UtilController.isEmpty(req.body.sortOrder)) {
        let sortField = req.body.sortField;
        let sortOrder = req.body.sortOrder;

        sort[sortField] = sortOrder;
      } else {
        sort = { updatedAt: -1 };
      }

      let pageSize = 10;
      let page = 0;
      if (!UtilController.isEmpty(req.body.pageSize)) pageSize = req.body.pageSize;
      if (!UtilController.isEmpty(req.body.page)) page = req.body.page;

      const project = await CORs.aggregate([
        { $match: match },
        // {
        //   $lookup: {
        //     from: "customers",
        //     localField: "customerId",
        //     foreignField: "_id",
        //     as: "customerId",
        //   },
        // },
        // {
        //   $unwind: {
        //     path: "$customerId",
        //     preserveNullAndEmptyArrays: true,
        //   },
        // },
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
        // {
        //   $lookup: {
        //     from: "users",
        //     localField: "projectHead",
        //     foreignField: "_id",
        //     as: "projectHead",
        //   },
        // },
        // {
        //   $lookup: {
        //     from: "users",
        //     localField: "createdBy",
        //     foreignField: "_id",
        //     as: "createdBy",
        //   },
        // },
        // {
        //   $unwind: {
        //     path: "$createdBy",
        //     preserveNullAndEmptyArrays: true,
        //   },
        // },
        // {
        //   $lookup: {
        //     from: "users",
        //     localField: "operatedBy",
        //     foreignField: "_id",
        //     as: "operatedBy",
        //   },
        // },
        // {
        //   $unwind: {
        //     path: "$operatedBy",
        //     preserveNullAndEmptyArrays: true,
        //   },
        // },
        // {
        //   $project: {
        //     _id: 1,
        //     projectTagId: 1,
        //     customerName: 1,
        //     projectName: 1,
        //     projectDescription: 1,
        //     startDate: 1,
        //     endDate: 1,
        //     projectStatus: 1,
        //     projectHead: "$projectHead",
        //     comments: 1,
        //     createdAt: 1,
        //     updatedAt: 1,
        //     taskName: 1,
        //     companyName: "$customerId.companyName",
        //     createdBy: {
        //       $concat: [{ $ifNull: ["$createdBy.fname", ""] }, " ", { $ifNull: ["$createdBy.lname", ""] }],
        //     },
        //     operatedBy: {
        //       $concat: [{ $ifNull: ["$operatedBy.fname", ""] }, " ", { $ifNull: ["$operatedBy.lname", ""] }],
        //     },
        //     organization: { organizationName: 1, _id: 1 },
        //     organizationName: "$organization.organizationName",
        //     customerName: "$customerId.customerName",
        //   },
        // },
        { $match: search },
        {
          $facet: {
            totalCount: [{ $count: "count" }],
            data: [{ $sort: sort }, { $skip: page * pageSize }, { $limit: pageSize }],
          },
        },
      ]);
      const totalCount = project?.[0].totalCount?.[0] ? project[0].totalCount[0].count : 0;
      const rows = project?.[0]?.data;
      const pages = Math.ceil(totalCount / pageSize);

      UtilController.sendSuccess(req, res, next, {
        rows: rows,
        filterRecords: totalCount,
        pages: pages,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
  // listCors: async (req, res, next) => {
  //   try {
  //     let { page = 1, pageSize = 10, search, sortBy = "createdAt", sortOrder = "desc", filters } = req.body;

  //     console.log("req.query", req.body)

  //     let match = {
  //       active: true,
  //     };
  //     let filterCriteria = {};
  //     if (!UtilController.isEmpty(req.body.startDate) || !UtilController.isEmpty(req.body.endDate)) {
  //       match["$and"] = [];
  //       if (!UtilController.isEmpty(req.body.startDate))
  //         match["$and"].push({ corApprovedDate: { $gte: req.body.startDate } });

  //       if (!UtilController.isEmpty(req.body.endDate)) match["$and"].push({ corApprovedDate: { $lte: req.body.endDate } });
  //     }
  //     if (search) {
  //       filterCriteria["$or"] = [
  //         { customerName: { $regex: search, $options: "i" } },
  //         { corNumber: { $regex: search, $options: "i" } },
  //       ];
  //     }
  //     // if (match) {
  //     //   filterCriteria["$or"] = match;
  //     // }

  //     if (filters) {
  //       filterCriteria = { ...filterCriteria, ...JSON.parse(filters) };
  //     }

  //     console.log("filterCriteria", filterCriteria)

  //     const cors = await CORs.find(filterCriteria)
  //       .populate("customerId", "customerName companyName")
  //       //.populate("projectId", "projectName projectName")
  //      // .sort({ [sortBy]: sortOrder })
  //       //.skip((page - 1) * pageSize)
  //      // .limit(Number(pageSize));

  //     const totalRecords = await CORs.countDocuments(filterCriteria);

  //     return UtilController.sendSuccess(req, res, next, {
  //       rows: cors,
  //       pages: Math.ceil(totalRecords / pageSize),
  //       filterRecords: totalRecords,
  //       responseCode: returnCode.validSession,
  //     });

  //     // res.status(200).json({ rows: cors,
  //     //   pages:  Math.ceil(totalRecords / pageSize),
  //     //   filterRecords: totalRecords,"responseCode": 109 });
  //   } catch (error) {
  //     return UtilController.sendError(req, res, next, error);
  //   }
  // },
};
