let request = require("request");
let mongoose = require("mongoose");
const Invoice = require("../../models/Invoice");
const { parsePhoneNumberFromString } = require("libphonenumber-js");
const UtilController = require("../services/UtilController");
const returnCode = require("../../../config/responseCode").returnCode;

const getCurrencyByCountry = country => {
  const currencyMap = {
    Canada: { currency: "CAD", symbol: "CA$" },
    USA: { currency: "USD", symbol: "$" },
    "United States": { currency: "USD", symbol: "$" },
    India: { currency: "INR", symbol: "Rs." },
  };
  return currencyMap[country] || { currency: "USD", symbol: "$" };
};

module.exports = {
  createInvoice: async (req, res) => {
    // console.log("createCors", req.user);
    try {
      const {
        customerId,
        projectId,
        projectName,
        customerName,
        poNumber,
        poAmount,
        balanceAmount,
        items,
        gstHst,
        gstHstPercent,
        subtotal,
        totalAmount,
        designPo,
        designCor,
        detailingPo,
        detailingCor,
        note,
        attachment,
        currency,
        currencySymbol,
      } = req.body;

      let processedItems = [];
      if (items && Array.isArray(items)) {
        processedItems = items.map((item, index) => {
          const unitRate = parseFloat(item.unitRate) || 0;
          const noOfHours = parseFloat(item.noOfHours) || 1;
          const itemstotalAmount = parseFloat(item.itemstotalAmount) || 1;

          return {
            slNo: index + 1,
            description: item.description || "",
            unitRate: unitRate,
            noOfHours: noOfHours,
            itemstotalAmount: itemstotalAmount,
          };
        });
      }

      // Calculate total from items if not provided
      const calculatedItemsTotal = processedItems.reduce((sum, item) => sum + item.totalAmount, 0);
      const finalTotalAmount = totalAmount || calculatedItemsTotal + (gstHst || 0);

      //if (UtilController.isEmpty(req.session.organizationId)) throw { message: "Organization Id is required" };
      const newInvoice = new Invoice({
        invoiceNumber: UtilController.generateUniqueNumber(6), // Implement a function to generate unique po numbers
        customerId,
        organizationId: req.session.organizationId,
        projectId,
        customerName,
        projectName,
        poNumber,
        poAmount,
        balanceAmount,
        items: processedItems,
        gstHst,
        gstHstPercent,
        subtotal,
        totalAmount,
        status: "Pending",
        designPo,
        designCor,
        detailingPo,
        detailingCor,
        note,
        attachment,
        //createdBy: req.user._id,
        currency: currency || "USD",
        currencySymbol: currencySymbol || "$",
      });

      const savedInvoice = await newInvoice.save();
      console.log("savedInvoice", savedInvoice);
      res.status(201).json({ message: "invoice created successfully", data: savedInvoice });
    } catch (error) {
      res.status(500).json({ message: "Error creating invoice", error: error.message });
    }
  },

  duplicateInvoice: async (req, res) => {
    try {
      const { invoiceId } = req.params;
      const existingInvoice = await Invoice.findById(invoiceId);
      if (!existingInvoice) {
        return res.status(404).json({ message: "invoice not found" });
      }

      const newInvoice = new Invoice({
        ...existingInvoice.toObject(),
        _id: mongoose.Types.ObjectId(), // Creating a new unique ID for the duplicated invoice
        invoiceNumber: UtilController.generateUniqueNumber(6),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: "pending",
      });

      const duplicatedInvoice = await newInvoice.save();
      res.status(201).json({ message: "invoice duplicated successfully", data: duplicatedInvoice });
    } catch (error) {
      res.status(500).json({ message: "Error duplicating invoice", error: error.message });
    }
  },
  deleteInvoice: async (req, res, next) => {
    try {
      let invoiceId = req.body.recordId;

      await Invoice.updateMany(
        { _id: { $in: invoiceId } },
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
        message: "invoice deleted successfully",
      });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },
  getInvoiceById: async (req, res, next) => {
    try {
      const recordId = req.body.recordId;
      let organizationId;
      if (!req.session.isSuperAdmin) {
        organizationId = req.session.organizationId;
      }

      if (!recordId) {
        return UtilController.sendError(req, res, next, {
          message: "Invalid invoice id",
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
            invoiceNumber: 1,
            poNumber: 1,
            poAmount: 1,
            balanceAmount: 1,
            items: 1,
            gstHst: 1,
            gstHstPercent: 1,
            subtotal: 1,
            totalAmount: 1,
            status: 1,
            project: 1,
            customer: 1,
            designPo: 1,
            designCor: 1,
            detailingPo: 1,
            detailingCor: 1,
            note: 1,
            attachment: 1,
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
          },
        },
      ];

      const [result] = await Invoice.aggregate(pipeline);
      console.log("result", result);
      return UtilController.sendSuccess(req, res, next, {
        data: result,
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },
  updateInvoice: async (req, res, next) => {
    try {
      const updateObj = req.body;

      // Check if invoiceId is provided in the request body
      if (!updateObj.invoiceId) {
        UtilController.sendError(req, res, next, {
          responseCode: returnCode.incompleteBody,
          message: "invoiceId is required.",
        });
        return;
      }

      // Add fields for operation tracking
      updateObj["operatedBy"] = req.session.userId;
      updateObj["updatedAt"] = Math.floor(Date.now() / 1000);

      // Find the cor by corId and update it
      const invoice = await Invoice.findByIdAndUpdate(updateObj.invoiceId, updateObj, { new: true });

      // If the cor is not found, send a 'not found' response
      if (!invoice) {
        UtilController.sendError(req, res, next, {
          responseCode: returnCode.recordNotFound,
          message: "invoice not found or update failed.",
        });
        return;
      }

      // Send success response with updated cor data
      UtilController.sendSuccess(req, res, next, {
        message: "invoice updated successfully.",
        invoice,
        responseCode: returnCode.validSession,
      });
    } catch (error) {
      console.error("Error updating invoice:", error);
      UtilController.sendError(req, res, next, {
        message: "An error occurred while updating the invoice.",
        error: error.message,
        responseCode: returnCode.errror,
      });
    }
  },
  listInvoice: async (req, res, next) => {
    try {
      let search = {};
      let userId = req.session.userId;
      let userType = req.session.userType;

      if (!UtilController.isEmpty(req.body.keyword)) {
        search["$or"] = [
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
        match["customerId"] = mongoose.Types.ObjectId(req.body.customerName);

      if (!UtilController.isEmpty(req.body.startDate) || !UtilController.isEmpty(req.body.endDate)) {
        match["$and"] = [];
        if (!UtilController.isEmpty(req.body.startDate))
          match["$and"].push({ createdAt: { $gte: req.body.startDate } });
        if (!UtilController.isEmpty(req.body.endDate)) match["$and"].push({ createdAt: { $lte: req.body.endDate } });
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

      const invoice = await Invoice.aggregate([
        { $match: match },

        // Lookup customer
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
            path: "$customer",
            preserveNullAndEmptyArrays: true,
          },
        },

        // Lookup organization
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

        // Add customer details and calculate currency
        {
          $addFields: {
            customerDetails: {
              _id: "$customer._id",
              companyName: "$customer.companyName",
              email: "$customer.email",
              mobileNo: "$customer.mobileNo",
              countryCode: "$customer.countryCode",
              address: "$customer.address",
              city: "$customer.city",
              state: "$customer.state",
              country: "$customer.country",
              postalCode: "$customer.postalCode",
              contactPerson: "$customer.contactPerson",
              logo: "$customer.logo",
              attachment: "$customer.attachment",
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
      ]);

      const totalCount = invoice?.[0].totalCount?.[0] ? invoice[0].totalCount[0].count : 0;
      let rows = invoice?.[0]?.data || [];
      const pages = Math.ceil(totalCount / pageSize);

      // ADD CURRENCY IN JAVASCRIPT AFTER AGGREGATION
      rows = rows.map(row => {
        const country = row.customer?.country || row.customerDetails?.country;
        const currencyInfo = getCurrencyByCountry(country);

        return {
          ...row,
          currency: row.currency || currencyInfo.currency,
          currencySymbol: row.currencySymbol || currencyInfo.symbol,
        };
      });

      UtilController.sendSuccess(req, res, next, {
        rows: rows,
        filterRecords: totalCount,
        pages: pages,
      });
    } catch (err) {
      console.error("Error in listInvoice:", err);
      UtilController.sendError(req, res, next, err);
    }
  },
  invoices: async (req, res, next) => {
    try {
      //apply sort, search, pagination
      let search = {};
      let userId = req.session.userId;
      let userType = req.session.userType;

      let match = {
        active: true,
      };

      let sort = { updatedAt: -1 };

      const invoice = await Invoice.aggregate([
        { $match: match },
        // {
        //   $lookup: {
        //     from: "customers",
        //     localField: "customerId",
        //     foreignField: "_id",
        //     as: "customerId",
        //   },
        // },
        //  {
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

        { $match: search },
        {
          $facet: {
            totalCount: [{ $count: "count" }],
            data: [{ $sort: sort }],
          },
        },
      ]);
      console.log("invoice", invoice);
      const totalCount = invoice?.[0].totalCount?.[0] ? invoice[0].totalCount[0].count : 0;
      const rows = invoice?.[0]?.data;

      UtilController.sendSuccess(req, res, next, {
        rows: rows,
        filterRecords: totalCount,
        pages: 1,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
  dropDownInvoiceStatus: async (req, res, next) => {
    const result = {
      Pending: "Pending",
      Paid: "Paid",
      Overdue: "Overdue",
    };
    try {
      UtilController.sendSuccess(req, res, next, {
        result,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
};
