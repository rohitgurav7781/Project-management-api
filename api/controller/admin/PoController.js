let request = require("request");
let mongoose = require("mongoose");
const Pos = require("../../models/Po");
const { parsePhoneNumberFromString } = require("libphonenumber-js");
const UtilController = require("../services/UtilController");
const Quote = require("../../models/Quote");
const returnCode = require("../../../config/responseCode").returnCode;

module.exports = {
  createPos: async (req, res) => {
    try {
      const {
        customerId,
        quoteId,
        quoteNumber,
        customerName,
        attachment,
        cToClient,
        status,
        cToUsica,
        designAmount,
        designVendor,
        poDate,
        detailingAmount,
        jobNumber,
        clientPoNumber,
        teamIds,
        designedPo,
        detailingPo,
        note,
        progress,
      } = req.body;
      if (UtilController.isEmpty(req.session.organizationId)) throw { message: "Organization Id is required" };
      const quote = await Quote.findById(quoteId);
      const projectName = quote.projectName;
      const projectId = quote.projectId;
      const newPos = new Pos({
        poNumber: UtilController.generateUniqueNumber(10), // Implement a function to generate unique po numbers
        customerId,
        customerName,
        projectId: projectId,
        quoteId,
        quoteNumber,
        projectName: projectName,
        organizationId: req.session.organizationId,
        cToClient,
        status: status || "pending",
        progress: progress || 0,
        cToUsica,
        designAmount,
        designVendor,
        poDate,
        detailingAmount,
        attachment,
        jobNumber,
        clientPoNumber,
        team: teamIds,
        designedPo,
        detailingPo,
        note,
        createdBy: null,
      });

      const savedPos = await newPos.save();
      res.status(201).json({ message: "PO created successfully", data: savedPos });
    } catch (error) {
      res.status(500).json({ message: "Error creating PO", error: error.message });
    }
  },

  duplicatePos: async (req, res) => {
    try {
      const { poId } = req.params;
      const existingPos = await Pos.findById(poId);
      if (!existingPos) {
        return res.status(404).json({ message: "POs not found" });
      }

      const newPos = new Pos({
        ...existingPos.toObject(),
        _id: mongoose.Types.ObjectId(), // Creating a new unique ID for the duplicated Pos
        poNumber: UtilController.generateUniqueNumber(10),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const duplicatedPos = await newPos.save();
      res.status(201).json({ message: "Po duplicated successfully", data: duplicatedPos });
    } catch (error) {
      res.status(500).json({ message: "Error duplicating Pos", error: error.message });
    }
  },
  deletePos: async (req, res, next) => {
    try {
      let poId = req.body.recordId;

      await Pos.updateMany(
        { _id: { $in: poId } },
        {
          $set: {
            active: false,
            operatedBy: req.session.userId,
            updatedAt: Math.floor(Date.now() / 1000),
          },
        },
        { new: true },
      );

      UtilController.sendSuccess(req, res, next, {
        message: "Pos deleted successfully",
      });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },
  getPosById: async (req, res, next) => {
    try {
      const recordId = req.body.recordId;
      let organizationId;
      if (!req.session.isSuperAdmin) {
        organizationId = req.session.organizationId;
      }

      if (!recordId) {
        return UtilController.sendError(req, res, next, {
          message: "Invalid pos id",
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
        // {
        //   $lookup: {
        //     from: "users",
        //     localField: "createdBy",
        //     foreignField: "_id",
        //     as: "createdBy",
        //   },u
        // },
        // {
        //   $unwind: {
        //     path: "$createdBy",
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
        {
          $lookup: {
            from: "users",
            localField: "team",
            foreignField: "_id",
            as: "team",
          },
        },

        {
          $project: {
            _id: 1,
            poNumber: 1,
            quoteNumber: 1,

            project: 1,
            customer: 1,
            quoteId: 1,
            detailingAmount: 1,
            designAmount: 1,
            designVendor: 1,
            cToUsica: 1,
            cToClient: 1,
            status: "$status",
            progress: 1,
            poDate: 1,
            attachment: 1,
            jobNumber: 1,
            clientPoNumber: 1,

            designedPo: 1,
            detailingPo: 1,
            note: 1,
            createdAt: 1,
            updatedAt: 1,
            organization: 1,
            team: {
              $map: {
                input: "$team",
                as: "u",
                in: {
                  _id: "$$u._id",
                  fname: "$$u.fname",
                  lname: "$$u.lname",
                  profileImage: "$$u.profileImage",
                },
              },
            },

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

      const [result] = await Pos.aggregate(pipeline);
      console.log("result", result);
      return UtilController.sendSuccess(req, res, next, {
        data: result,
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },

  updatePos: async (req, res, next) => {
    try {
      const updateObj = req.body;

      // Check if poId is provided in the request body
      if (!updateObj.poId) {
        UtilController.sendError(req, res, next, {
          responseCode: returnCode.incompleteBody,
          message: "poId is required.",
        });
        return;
      }

      if (Array.isArray(updateObj.teamIds)) {
        updateObj.team = updateObj.teamIds
          .filter(id => id && mongoose.Types.ObjectId.isValid(id))
          .map(id => new mongoose.Types.ObjectId(id));
        delete updateObj.teamIds;
      }

      // Add fields for operation tracking
      updateObj["operatedBy"] = req.session.userId;
      updateObj["updatedAt"] = Math.floor(Date.now() / 1000);

      // Find the po by poId and update it
      const po = await Pos.findByIdAndUpdate(updateObj.poId, updateObj, { new: true });

      // If the po is not found, send a 'not found' response
      if (!po) {
        UtilController.sendError(req, res, next, {
          responseCode: returnCode.recordNotFound,
          message: "po not found or update failed.",
        });
        return;
      }

      // Send success response with updated po data
      UtilController.sendSuccess(req, res, next, {
        message: "po updated successfully.",
        po,
        responseCode: returnCode.validSession,
      });
    } catch (error) {
      console.error("Error updating po:", error);
      UtilController.sendError(req, res, next, {
        message: "An error occurred while updating the po.",
        error: error.message,
        responseCode: returnCode.errror,
      });
    }
  },
  listPos: async (req, res, next) => {
    try {
      //apply sort, search, pagination
      let search = {};
      let userId = req.session.userId;
      let userType = req.session.userType;
      if (!UtilController.isEmpty(req.body.keyword)) {
        search["$or"] = [
          // { "scuId.title": { $regex: req.body.keyword, $options: "i" } },
          { customerName: { $regex: req.body.keyword, $options: "i" } },
          { poNumber: { $regex: req.body.keyword, $options: "i" } },
          { projectName: { $regex: req.body.keyword, $options: "i" } },
        ];
      }

      let match = {
        active: true,
      };
      if (!UtilController.isEmpty(req.body.projectId)) {
        match["projectId"] = mongoose.Types.ObjectId(req.body.projectId);
      }

      if (!UtilController.isEmpty(req.session.organizationId))
        match["organizationId"] = mongoose.Types.ObjectId(req.session.organizationId);
      if (!UtilController.isEmpty(req.body.active)) match["active"] = req.body.active;

      if (!UtilController.isEmpty(req.body.customerName))
        match["customerName"] = mongoose.Types.ObjectId(req.body.customerName);

      if (!UtilController.isEmpty(req.body.startDate) || !UtilController.isEmpty(req.body.endDate)) {
        match["$and"] = [];
        if (!UtilController.isEmpty(req.body.startDate)) match["$and"].push({ poDate: { $gte: req.body.startDate } });

        if (!UtilController.isEmpty(req.body.endDate)) match["$and"].push({ poDate: { $lte: req.body.endDate } });
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

      const project = await Pos.aggregate([
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
            data: [
              { $sort: sort },
              { $skip: page * pageSize },
              { $limit: pageSize },

              // Join team users for just the paged rows
              {
                $lookup: {
                  from: "users",
                  localField: "team",
                  foreignField: "_id",
                  as: "team",
                },
              },

              // Shape team as lightweight objects for the UI
              {
                $project: {
                  _id: 1,
                  active: 1,
                  detailingAmount: 1,
                  designAmount: 1,
                  designVendor: 1,
                  cToUsica: 1,
                  cToClient: 1,
                  attachment: 1,
                  status: 1,
                  progress: 1,
                  poNumber: 1,
                  customerId: 1,
                  customerName: 1,
                  projectId: 1,
                  quoteId: 1,
                  quoteNumber: 1,
                  projectName: 1,
                  organizationId: 1,
                  poDate: 1,
                  jobNumber: 1,
                  clientPoNumber: 1,
                  designedPo: 1,
                  detailingPo: 1,
                  note: 1,
                  createdBy: 1,
                  createdAt: 1,
                  updatedAt: 1,
                  organization: 1,

                  team: {
                    $map: {
                      input: "$team",
                      as: "u",
                      in: {
                        _id: "$$u._id",
                        fname: "$$u.fname",
                        lname: "$$u.lname",
                        profileImage: "$$u.profileImage",
                      },
                    },
                  },
                },
              },
            ],
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
  // listPos: async (req, res, next) => {
  //   try {
  //     let { page = 1, pageSize = 10, search, sortBy = "createdAt", sortOrder = "desc", filters } = req.query;
  //     let filterCriteria = {};

  //     if (search) {
  //       filterCriteria["$or"] = [
  //         { customerName: { $regex: search, $options: "i" } },
  //         { poNumber: { $regex: search, $options: "i" } },
  //         { projectName: { $regex: search, $options: "i" } },
  //       ];
  //     }

  //     if (filters) {
  //       filterCriteria = { ...filterCriteria, ...JSON.parse(filters) };
  //     }

  //     const pos = await Pos.find(filterCriteria)
  //       .populate("customerId", "customerName companyName")
  //       .sort({ [sortBy]: sortOrder })
  //       .skip((page - 1) * pageSize)
  //       .limit(Number(pageSize));

  //     const totalRecords = await Pos.countDocuments(filterCriteria);
  //     return UtilController.sendSuccess(req, res, next, {
  //       rows: pos,
  //       pages: Math.ceil(totalRecords / pageSize),
  //       filterRecords: totalRecords,
  //       responseCode: returnCode.validSession,
  //     });
  //     // res.status(200).json({ data: pos, totalRecords, pages: Math.ceil(totalRecords / pageSize) });
  //   } catch (error) {
  //     res.status(500).json({ message: "Error fetching pos", error: error.message });
  //   }
  // },
};
