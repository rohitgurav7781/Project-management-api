let request = require("request");
let mongoose = require("mongoose");
const Payment = require("../../models/Payment");
const { parsePhoneNumberFromString } = require("libphonenumber-js");
const UtilController = require("../services/UtilController");
const Invoice = require("../../models/Invoice");
const returnCode = require("../../../config/responseCode").returnCode;

module.exports = {
  createPayment: async (req, res) => {
    // console.log("createCors", req.user);
    try {
      const {
        paymentMode,
        invoiceNumber,
        invoiceId,
        // invoiceDate,
        invoiceAmount,
        receivedAmount,
        chequeNumber,
        chequeDate,
        bankName,
        refNumber,
        transactionDate,
        balanceAmount,
        attachment,
        note,
      } = req.body;

      const inv = await Invoice.findById({ _id: invoiceId });

      let customerId = inv.customerId;
      let projectId = inv.projectId;
      let projectName = inv.projectName;
      let customerName = inv.customerName;
      let invoiceDate = inv.invoiceDate;

      console.log("inv", inv);

      // if (UtilController.isEmpty(req.session.organizationId)) throw { message: "Organization Id is required" };
      const newPayment = new Payment({
        paymentNumber: UtilController.generateUniqueNumber(8),
        customerId: customerId,
        organizationId: req.session.organizationId,
        projectId: projectId,
        customerName: customerName,
        projectName: projectName,
        invoiceNumber,
        invoiceId,
        invoiceDate: invoiceDate,
        paymentMode,
        invoiceAmount,
        receivedAmount,
        chequeNumber,
        chequeDate,
        bankName,
        refNumber,
        transactionDate,
        balanceAmount,
        status: "Pending",
        attachment,
        note,
        //createdBy: req.user._id,
      });

      const savedPayment = await newPayment.save();
      console.log("savedPayment", savedPayment);
      res.status(201).json({ message: "payment created successfully", data: savedPayment });
    } catch (error) {
      res.status(500).json({ message: "Error creating payment", error: error.message });
    }
  },

  duplicatePayment: async (req, res) => {
    try {
      const { paymentId } = req.params;
      const existingPayment = await Payment.findById(paymentId);
      if (!existingPayment) {
        return res.status(404).json({ message: "payment not found" });
      }

      const newPayment = new Payment({
        ...existingPayment.toObject(),
        _id: mongoose.Types.ObjectId(), // Creating a new unique ID for the duplicated COR

        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: "Created",
      });

      const duplicatedPayment = await newPayment.save();
      res.status(201).json({ message: "payment duplicated successfully", data: duplicatedPayment });
    } catch (error) {
      res.status(500).json({ message: "Error duplicating payment", error: error.message });
    }
  },
  deletePayment: async (req, res, next) => {
    try {
      let paymentId = req.body.recordId;

      await Payment.updateMany(
        { _id: { $in: paymentId } },
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
        message: "Payment deleted successfully",
      });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },
  getPaymentById: async (req, res, next) => {
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
            project: 1,
            customer: 1,
            invoiceNumber: 1,
            invoiceId: 1,
            invoiceDate: 1,
            invoiceAmount: 1,
            receivedAmount: 1,
            chequeNumber: 1,
            chequeDate: 1,
            bankName: 1,
            refNumber: 1,
            transactionDate: 1,
            balanceAmount: 1,
            status: 1,
            attachment: 1,
            note: 1,
            createdAt: 1,
            updatedAt: 1,
            organization: 1,
            paymentMode: 1,
            organization: {
              name: "$organization.organizationName",
              _id: "$organization._id",
            },
          },
        },
      ];

      const [result] = await Payment.aggregate(pipeline);
      console.log("result", result);
      return UtilController.sendSuccess(req, res, next, {
        data: result,
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },
  updatePayment: async (req, res, next) => {
    try {
      const updateObj = req.body;

      // Check if corId is provided in the request body
      if (!updateObj.paymentId) {
        UtilController.sendError(req, res, next, {
          responseCode: returnCode.incompleteBody,
          message: "paymentId is required.",
        });
        return;
      }

      // Add fields for operation tracking
      updateObj["operatedBy"] = req.session.userId;
      updateObj["updatedAt"] = Math.floor(Date.now() / 1000);

      // Find the cor by corId and update it
      const payment = await Payment.findByIdAndUpdate(updateObj.paymentId, updateObj, { new: true });

      // If the payment is not found, send a 'not found' response
      if (!payment) {
        UtilController.sendError(req, res, next, {
          responseCode: returnCode.recordNotFound,
          message: "payment not found or update failed.",
        });
        return;
      }

      // Send success response with updated payment data
      UtilController.sendSuccess(req, res, next, {
        message: "payment updated successfully.",
        payment,
        responseCode: returnCode.validSession,
      });
    } catch (error) {
      console.error("Error updating payment:", error);
      UtilController.sendError(req, res, next, {
        message: "An error occurred while updating the payment.",
        error: error.message,
        responseCode: returnCode.errror,
      });
    }
  },
  listPayment: async (req, res, next) => {
    try {
      //apply sort, search, pagination
      let search = {};
      let userId = req.session.userId;
      let userType = req.session.userType;
      if (!UtilController.isEmpty(req.body.keyword)) {
        search["$or"] = [
          // { "scuId.title": { $regex: req.body.keyword, $options: "i" } },
          { customerName: { $regex: req.body.keyword, $options: "i" } },
          { invoiceNumber: { $regex: req.body.keyword, $options: "i" } },
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
          match["$and"].push({ invoiceDate: { $gte: req.body.startDate } });

        if (!UtilController.isEmpty(req.body.endDate)) match["$and"].push({ invoiceDate: { $lte: req.body.endDate } });
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

      const payment = await Payment.aggregate([
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
      const totalCount = payment?.[0].totalCount?.[0] ? payment[0].totalCount[0].count : 0;
      const rows = payment?.[0]?.data;
      const pages = Math.ceil(totalCount / pageSize);
      console.log("rows", rows);
      UtilController.sendSuccess(req, res, next, {
        rows: rows,
        filterRecords: totalCount,
        pages: pages,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
};
