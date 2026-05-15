let request = require("request");
let mongoose = require("mongoose");
const Quote = require("../../models/Quote");
const { parsePhoneNumberFromString } = require("libphonenumber-js");
const UtilController = require("../services/UtilController");
const Customer = require("../../models/Customer");
const QuoteEstimate = require("../../models/QuoteEstimate");
const QuotePricing = require("../../models/QuotePricing");
const PieceCount = require("../../models/PieceCount");
const MainSteelSetting = require("../../models/MainSteelSetting");
const OtherActivity = require("../../models/OtherActivity");
const EstimateQuote = require("../../models/EstimateQuote");
const returnCode = require("../../../config/responseCode").returnCode;

module.exports = {
  createEstimateQuote: async (req, res) => {
    try {
      const quote = new EstimateQuote(req.body);
      await quote.save();
      await Quote.findByIdAndUpdate(
        { _id: quote.quoteId },
        { $set: { status: "Estimate", updatedAt: Math.floor(Date.now() / 1000) } },
      ),
        res.status(201).json({ message: "Quote created successfully", data: quote });
    } catch (error) {
      console.log("error", error);
      res.status(500).json({ message: "Error creating quote", error: error.message });
    }
  },
  otherActivity: async (req, res) => {
    try {
      const otherActivity = await OtherActivity.findOne({});

      res.status(201).json({ message: "Quote created successfully", data: otherActivity });
    } catch (error) {
      console.log("error", error);
      res.status(500).json({ message: "Error creating quote", error: error.message });
    }
  },
  // mainSteelSettings: async (req, res) => {
  //   try {
  //     const mainsteelsettings = await MainSteelSetting.findOne({});

  //     res.status(201).json({ message: "Quote created successfully", data: mainsteelsettings });
  //   } catch (error) {
  //     console.log("error", error);
  //     res.status(500).json({ message: "Error creating quote", error: error.message });
  //   }
  // },

  mainSteelSettings: async (req, res) => {
    try {
      // 1. Get main steel settings
      const mainsteelsettings = await MainSteelSetting.findOne({});
      if (!mainsteelsettings) {
        return res.status(404).json({ message: "No main steel settings found" });
      }

      // 2. Aggregate PieceCount -> sum qty by assembly + profile
      const pieceCountAgg = await PieceCount.aggregate([
        {
          $group: {
            _id: { assembly: "$assembly", profile: "$profile" },
            qty: {
              $sum: {
                $convert: {
                  input: "$quantity",
                  to: "int",
                  onError: 0,
                  onNull: 0,
                },
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            assembly: "$_id.assembly",
            profile: "$_id.profile",
            qty: 1,
          },
        },
      ]);

      //     // 3. Merge & update in-memory
      const updatedMainSteelEstimate = mainsteelsettings.mainSteelEstimate.map(assemblyObj => {
        const updatedDetails = assemblyObj.detail.map(detailObj => {
          const found = pieceCountAgg.find(p => p.assembly === assemblyObj.assembly && p.profile === detailObj.profile);
          return {
            ...(detailObj.toObject?.() || detailObj),
            qty: found ? found.qty : detailObj.qty,
          };
        });

        return {
          ...(assemblyObj.toObject?.() || assemblyObj),
          detail: updatedDetails,
        };
      });

      // 4. Save directly with findOneAndUpdate (avoids VersionError)
      const updatedDoc = await MainSteelSetting.findOneAndUpdate(
        {},
        { $set: { mainSteelEstimate: updatedMainSteelEstimate } },
        { new: true },
      );

      // 5. Return updated result
      res.status(200).json({
        message: "Main steel settings updated with PieceCount quantities",
        data: updatedDoc,
      });
    } catch (error) {
      console.log("error", error);
      res.status(500).json({
        message: "Error updating main steel settings",
        error: error.message,
      });
    }
  },

  createPieceCount: async (req, res) => {
    try {
      let data;
      if (Array.isArray(req.body)) {
        data = await PieceCount.insertMany(req.body); // save multiple
      } else {
        const quote = new PieceCount(req.body);
        data = await quote.save();
      }

      // Remove __v from all documents
      const cleaned = Array.isArray(data)
        ? data.map(d => {
            const { __v, ...rest } = d.toObject();
            return rest;
          })
        : (() => {
            const { __v, ...rest } = data.toObject();
            return rest;
          })();

      res.status(201).json({
        message: "Quote created successfully",
        data: cleaned,
      });
    } catch (error) {
      console.log("error", error);
      res.status(500).json({
        message: "Error creating quote",
        error: error.message,
      });
    }
  },

  updatePieceCount: async (req, res) => {
    try {
      const { _id, quoteId, ...updateData } = req.body;

      if (!_id) {
        return res.status(400).json({ message: "ID is required for update" });
      }

      // Find and update the piece count record
      const updatedPieceCount = await PieceCount.findOneAndUpdate(
        { _id: _id, quoteId: quoteId },
        { $set: updateData },
        { new: true, runValidators: true },
      );

      if (!updatedPieceCount) {
        return res.status(404).json({
          message: "PieceCount not found",
        });
      }

      res.status(200).json({
        message: "PieceCount updated successfully",
        data: updatedPieceCount,
      });
    } catch (error) {
      console.error("Error updating piece count:", error);
      res.status(500).json({
        message: "Error updating piece count",
        error: error.message,
      });
    }
  },

  getAllPieceCounts: async (req, res) => {
    try {
      const { quoteId } = req.body; // Get from body instead of query
      const filter = quoteId ? { quoteId: mongoose.Types.ObjectId(quoteId) } : {};

      const pieceCounts = await PieceCount.find(filter);
      res.status(200).json({
        message: "PieceCounts fetched successfully",
        data: pieceCounts,
      });
    } catch (error) {
      console.error("Error fetching piece counts:", error);
      res.status(500).json({
        message: "Error fetching piece counts",
        error: error.message,
      });
    }
  },

  deletePieceCount: async (req, res) => {
    try {
      const { id, quoteId } = req.body;
      if (!id) {
        return res.status(400).json({ message: "ID is required" });
      }

      const deleted = await PieceCount.findOneAndDelete({
        _id: id,
        quoteId: quoteId,
      });

      res.status(200).json({
        message: "PieceCount deleted successfully",
        data: deleted,
      });
    } catch (error) {
      console.error("Error deleting piece count:", error);
      res.status(500).json({
        message: "Error deleting piece count",
        error: error.message,
      });
    }
  },

  updateQuotePricing: async (req, res, next) => {
    try {
      const updateObj = req.body;

      const s = mongoose.Types.ObjectId(updateObj.quoteId);

      // Check if customerId is provided in the request body
      if (!updateObj.quoteId) {
        UtilController.sendError(req, res, next, {
          responseCode: returnCode.incompleteBody,
          message: "quoteId is required.",
        });
        return;
      }

      delete updateObj.quoteId;

      // Add fields for operation tracking
      updateObj["operatedBy"] = req.session.userId;
      updateObj["updatedAt"] = Math.floor(Date.now() / 1000);

      // Find the quote by quoteId and update it
      const quote = await QuotePricing.findOneAndUpdate(
        { quoteId: s },
        { pricing: updateObj.pricing, totalPrice: updateObj.totalPrice, submittedQuotePrice: updateObj.submittedPrice },
        { new: true },
      );

      // If the quote is not found, send a 'not found' response
      if (!quote) {
        UtilController.sendError(req, res, next, {
          responseCode: returnCode.recordNotFound,
          message: "quote not found or update failed.",
        });
        return;
      }

      // Send success response with updated quote data
      UtilController.sendSuccess(req, res, next, {
        message: "quote updated successfully.",
        quote,
        responseCode: returnCode.validSession,
      });
    } catch (error) {
      console.error("Error updating quote:", error);
      UtilController.sendError(req, res, next, {
        message: "An error occurred while updating the quote.",
        error: error.message,
        responseCode: returnCode.errror,
      });
    }
  },

  getQuotePricingById: async (req, res, next) => {
    try {
      const recordId = req.body.recordId;

      if (!recordId) {
        return UtilController.sendError(req, res, next, {
          message: "Invalid Quote id",
          responseCode: returnCode.incompleteBody,
        });
      }

      let matchStage = {
        quoteId: mongoose.Types.ObjectId(recordId),
        // active: true,
      };

      const pipeline = [
        {
          $match: matchStage,
        },
        // {
        //   $lookup: {
        //     from: "customers",
        //     localField: "customerId",
        //     foreignField: "_id",
        //     as: "customer",
        //   },
        // },
        // {
        //   $unwind: {
        //     path: "$customers",
        //     preserveNullAndEmptyArrays: true,
        //   },
        // },
        // {
        //   $lookup: {
        //     from: "projects",
        //     localField: "projectId",
        //     foreignField: "_id",
        //     as: "project",
        //   },
        // },
        // {
        //   $unwind: {
        //     path: "$projects",
        //     preserveNullAndEmptyArrays: true,
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
        //     from: "organizations",
        //     localField: "organizationId",
        //     foreignField: "_id",
        //     as: "organization",
        //   },
        // },
        // {
        //   $unwind: {
        //     path: "$organization",
        //     preserveNullAndEmptyArrays: true,
        //   },
        // },
        // {
        //   $project: {
        //     _id: 1,

        //     mtoIncluded: 1,
        //     connectionDesignIncluded: 1,

        //     project: 1,
        //     customer: 1,

        //     createdAt: 1,
        //     updatedAt: 1,
        //     organization: 1,
        //     quoteName: 1,

        //     quoteReceivedDate: 1,
        //     quoteDueDate: 1,
        //     remarks: 1,
        //     // logo: 1,
        //     // createdBy: {
        //     //   $concat: [{ $ifNull: ["$createdBy.fname", ""] }, " ", { $ifNull: ["$createdBy.lname", ""] }],
        //     // },
        //     // head: {
        //     //   name: {
        //     //     $concat: [{ $ifNull: ["$head.fname", ""] }, " ", { $ifNull: ["$head.lname", ""] }],
        //     //   },
        //     //   _id: "$head._id",
        //     // },
        //     organization: {
        //       name: "$organization.organizationName",
        //       _id: "$organization._id",
        //     },
        //     // corApprovedDate: 1,
        //   },
        // },
      ];

      const [result] = await QuotePricing.aggregate(pipeline);
      console.log("result", result);
      return UtilController.sendSuccess(req, res, next, {
        data: result,
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },

  getQuotePricing: async (req, res) => {
    try {
      const quote = new QuotePricing(req.body);
      await quote.save();
      await Quote.findByIdAndUpdate({ _id: quote.quoteId }, { $set: { status: "Quote Created" } }),
        res.status(201).json({ message: "Quote created successfully", data: quote });
    } catch (error) {
      console.log("error", error);
      res.status(500).json({ message: "Error creating quote", error: error.message });
    }
  },

  createQuotePricing: async (req, res) => {
    try {
      const quote = new QuotePricing(req.body);
      await quote.save();
      await Quote.findByIdAndUpdate(
        { _id: quote.quoteId },
        { $set: { status: "Quote Created", updatedAt: Math.floor(Date.now() / 1000) } },
      ),
        res.status(201).json({ message: "Quote created successfully", data: quote });
    } catch (error) {
      console.log("error", error);
      res.status(500).json({ message: "Error creating quote", error: error.message });
    }
  },

  updateQuoteEstimate: async (req, res, next) => {
    try {
      const updateObj = req.body;

      console.log("updateObj", updateObj);

      const s = mongoose.Types.ObjectId(updateObj.quoteId);

      updateObj.quoteId = s;

      //       const existing = await QuoteEstimate.findOne({  quoteId: mongoose.Types.ObjectId(updateObj.quoteId), });
      // console.log("Found existing", existing);

      // Check if customerId is provided in the request body
      if (!updateObj.quoteId) {
        UtilController.sendError(req, res, next, {
          responseCode: returnCode.incompleteBody,
          message: "quoteId is required.",
        });
        return;
      }

      delete updateObj.quoteId;

      // Add fields for operation tracking
      updateObj["operatedBy"] = req.session.userId;
      updateObj["updatedAt"] = Math.floor(Date.now() / 1000);

      const quote = await QuoteEstimate.findOneAndUpdate(
        { quoteId: s },
        {
          $set: {
            structureType: updateObj.structureType,
            complexity: updateObj.complexity,
            measurementSystem: updateObj.measurementSystem,
            estimates: updateObj.estimates,
            activities: updateObj.activities,
            structuralHours: updateObj.structuralHours,
            miscHours: updateObj.miscHours,
            totalHours: updateObj.totalHours,
            inclusions: updateObj.inclusions,
            exclusions: updateObj.exclusions,
            schedule: updateObj.schedule,
          },
        },
        { new: true },
      );

      // Find the quote by quoteId and update it
      // const quote = await QuoteEstimate.findOneAndUpdate(
      //   { quoteId: s },
      //   {
      //     structureType: updateObj.structureType,
      //     complexity: updateObj.complexity,
      //     measurementSystem: updateObj.measurementSystem,
      //     estimates: updateObj.estimates,
      //     activities: updateObj.activities,
      //     structuralHours: updateObj.structuralHours,
      //     miscHours: updateObj.miscHours,
      //     totalHours: updateObj.totalHours,
      //     inclusions: updateObj.inclusions,
      //     exclusions: updateObj.exclusions,
      //     schedule: updateObj.schedule,
      //   },
      //   { new: true },
      // );

      // If the quote is not found, send a 'not found' response
      if (!quote) {
        UtilController.sendError(req, res, next, {
          responseCode: returnCode.recordNotFound,
          message: "quote not found or update failed.",
        });
        return;
      }

      // Send success response with updated quote data
      UtilController.sendSuccess(req, res, next, {
        message: "quote updated successfully.",
        quote,
        responseCode: returnCode.validSession,
      });
    } catch (error) {
      console.error("Error updating quote:", error);
      UtilController.sendError(req, res, next, {
        message: "An error occurred while updating the quote.",
        error: error.message,
        responseCode: returnCode.errror,
      });
    }
  },

  getQuoteEstimateById: async (req, res, next) => {
    try {
      const recordId = req.body.recordId;

      if (!recordId) {
        return UtilController.sendError(req, res, next, {
          message: "Invalid Quote id",
          responseCode: returnCode.incompleteBody,
        });
      }

      let matchStage = {
        quoteId: mongoose.Types.ObjectId(recordId),
        // active: true,
      };

      const pipeline = [
        {
          $match: matchStage,
        },
      ];

      const [result] = await QuoteEstimate.aggregate(pipeline);
      console.log("result", result);
      return UtilController.sendSuccess(req, res, next, {
        data: result,
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },

  createQuoteEstimate: async (req, res) => {
    try {
      const quote = new QuoteEstimate(req.body);
      await quote.save();
      await Quote.findByIdAndUpdate(
        { _id: quote.quoteId },
        { $set: { status: "Estimate", updatedAt: Math.floor(Date.now() / 1000) } },
      ),
        res.status(201).json({ message: "Quote created successfully", data: quote });
    } catch (error) {
      console.log("error", error);
      res.status(500).json({ message: "Error creating quote", error: error.message });
    }
  },
  createQuote: async (req, res) => {
    try {
      const {
        customerId,
        projectId,
        projectName,
        customerName,
        mtoIncluded,
        connectionDesignIncluded,
        quoteName,
        quoteReceivedDate,
        quoteDueDate,
        remarks,
        attachment,
        note,
      } = req.body;
      if (UtilController.isEmpty(req.session.organizationId)) throw { message: "Organization Id is required" };
      const cu = await Customer.findById({ _id: customerId });
      const customerNumber = cu.customerTagId;
      const newQuote = new Quote({
        quoteNumber: UtilController.generateUniqueNumber(10), // Implement a function to generate unique quote numbers
        customerId,
        customerName,
        projectId,
        customerNumber: customerNumber,
        quoteName,
        projectName,
        organizationId: req.session.organizationId,
        mtoIncluded,
        connectionDesignIncluded,
        quoteReceivedDate,
        quoteDueDate,
        remarks,
        attachment,
        note,
        createdBy: null,
      });

      const savedQuote = await newQuote.save();
      res.status(201).json({ message: "Quote created successfully", data: savedQuote });
    } catch (error) {
      res.status(500).json({ message: "Error creating quote", error: error.message });
    }
  },

  duplicateQuote: async (req, res) => {
    try {
      const { quoteId } = req.params;
      const existingQuote = await Quote.findById(quoteId);
      if (!existingQuote) {
        return res.status(404).json({ message: "Quote not found" });
      }

      const newQuote = new Quote({
        ...existingQuote.toObject(),
        _id: mongoose.Types.ObjectId(), // Creating a new unique ID for the duplicated quote
        quoteNumber: UtilController.generateUniqueNumber(10),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: "Quote Created",
      });

      const duplicatedQuote = await newQuote.save();
      res.status(201).json({ message: "Quote duplicated successfully", data: duplicatedQuote });
    } catch (error) {
      res.status(500).json({ message: "Error duplicating quote", error: error.message });
    }
  },
  listQuotes: async (req, res, next) => {
    try {
      //apply sort, search, pagination
      let search = {};
      let userId = req.session.userId;
      let userType = req.session.userType;
      if (!UtilController.isEmpty(req.body.keyword)) {
        search["$or"] = [
          // { "scuId.title": { $regex: req.body.keyword, $options: "i" } },
          { customerName: { $regex: req.body.keyword, $options: "i" } },
          { quoteNumber: { $regex: req.body.keyword, $options: "i" } },
          { quoteName: { $regex: req.body.keyword, $options: "i" } },
          { projectName: { $regex: req.body.keyword, $options: "i" } },
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

      if (!UtilController.isEmpty(req.body.startDate1) || !UtilController.isEmpty(req.body.endDate1)) {
        match["$and"] = [];
        if (!UtilController.isEmpty(req.body.startDate1))
          match["$and"].push({ quoteReceivedDate: { $gte: req.body.startDate1 } });

        if (!UtilController.isEmpty(req.body.endDate1))
          match["$and"].push({ quoteDueDate: { $lte: req.body.endDate1 } });
      }

      let sort = { updatedAt: -1 };
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

      const project = await Quote.aggregate([
        { $match: match },
        {
          $addFields: {
            statusOrder: {
              $switch: {
                branches: [
                  { case: { $eq: ["$status", "Draft"] }, then: 1 },
                  { case: { $eq: ["$status", "Estimate"] }, then: 2 },
                  { case: { $eq: ["$status", "Quote Created"] }, then: 3 },
                ],
                default: 99, // For any other status
              },
            },
          },
        },
        {
          $sort: {
            statusOrder: 1, // sort by custom status order
            updatedAt: -1, // optional: sort by createdAt within same status
          },
        },
        {
          $project: {
            statusOrder: 0, // remove the helper field from result
          },
        },

        // { $match: { updatedAt: { $exists: true } } },
        //   { $sort: sort },
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
            data: [{ $skip: page * pageSize }, { $limit: pageSize }],
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
  // listQuotes: async (req, res, next) => {
  //   try {
  //     let { page = 1, pageSize = 10, search, sortBy = "createdAt", sortOrder = "desc", filters } = req.query;
  //     let filterCriteria = {};

  //     if (search) {
  //       filterCriteria["$or"] = [
  //         { customerName: { $regex: search, $options: "i" } },
  //         { quoteName: { $regex: search, $options: "i" } },
  //         { quoteNumber: { $regex: search, $options: "i" } },
  //         { customerId: { $regex: search, $options: "i" } },
  //         { projectName: { $regex: search, $options: "i" } },
  //       ];
  //     }

  //     if (filters) {
  //       filterCriteria = { ...filterCriteria, ...JSON.parse(filters) };
  //     }

  //     const quotes = await Quote.find(filterCriteria)
  //       .populate("customerId", "customerName companyName")
  //       .sort({ [sortBy]: sortOrder })
  //       .skip((page - 1) * pageSize)
  //       .limit(Number(pageSize));

  //     const totalRecords = await Quote.countDocuments(filterCriteria);
  //     return UtilController.sendSuccess(req, res, next, {
  //       rows: quotes,
  //       pages: Math.ceil(totalRecords / pageSize),
  //       filterRecords: totalRecords,
  //       responseCode: returnCode.validSession,
  //     });
  //     //res.status(200).json({ data: quotes, totalRecords, pages: Math.ceil(totalRecords / pageSize) });
  //   } catch (error) {
  //     return UtilController.sendError(req, res, next, error);
  //     // res.status(500).json({ message: "Error fetching quotes", error: error.message });
  //   }
  // },
  deleteQuotes: async (req, res, next) => {
    try {
      let quoteId = req.body.recordId;

      await Quote.updateMany(
        { _id: { $in: quoteId } },
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
        message: "Quote deleted successfully",
      });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },

  quotes: async (req, res, next) => {
    try {
      const { customerId } = req.query;

      let filter = { active: true };

      // Add customerId filter if provided
      if (customerId) {
        filter.customerId = customerId;
      }

      const quotes = await Quote.find(filter);

      UtilController.sendSuccess(req, res, next, {
        rows: quotes,
        responseCode: 109,
      });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },

  getQuoteById: async (req, res, next) => {
    try {
      const recordId = req.body.recordId;
      let organizationId;
      if (!req.session.isSuperAdmin) {
        organizationId = req.session.organizationId;
      }

      if (!recordId) {
        return UtilController.sendError(req, res, next, {
          message: "Invalid Quote id",
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

            mtoIncluded: 1,
            connectionDesignIncluded: 1,

            project: 1,
            customer: 1,

            createdAt: 1,
            updatedAt: 1,
            organization: 1,
            quoteName: 1,

            quoteReceivedDate: 1,
            quoteDueDate: 1,
            remarks: 1,
            attachment: 1,
            note: 1,
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
            // corApprovedDate: 1,
          },
        },
      ];

      const [result] = await Quote.aggregate(pipeline);
      console.log("result", result);
      return UtilController.sendSuccess(req, res, next, {
        data: result,
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },

  updateQuote: async (req, res, next) => {
    try {
      const updateObj = req.body;

      // Check if customerId is provided in the request body
      if (!updateObj.quoteId) {
        UtilController.sendError(req, res, next, {
          responseCode: returnCode.incompleteBody,
          message: "quoteId is required.",
        });
        return;
      }

      // Add fields for operation tracking
      updateObj["operatedBy"] = req.session.userId;
      updateObj["updatedAt"] = Math.floor(Date.now() / 1000);

      // Find the quote by quoteId and update it
      const quote = await Quote.findByIdAndUpdate(updateObj.quoteId, updateObj, { new: true });

      // If the quote is not found, send a 'not found' response
      if (!quote) {
        UtilController.sendError(req, res, next, {
          responseCode: returnCode.recordNotFound,
          message: "quote not found or update failed.",
        });
        return;
      }

      // Send success response with updated quote data
      UtilController.sendSuccess(req, res, next, {
        message: "quote updated successfully.",
        quote,
        responseCode: returnCode.validSession,
      });
    } catch (error) {
      console.error("Error updating quote:", error);
      UtilController.sendError(req, res, next, {
        message: "An error occurred while updating the quote.",
        error: error.message,
        responseCode: returnCode.errror,
      });
    }
  },
};
