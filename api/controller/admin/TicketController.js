let request = require("request");
let mongoose = require("mongoose");
const Event = require("../../models/Event");
const { parsePhoneNumberFromString } = require("libphonenumber-js");
const UtilController = require("../services/UtilController");
const Quote = require("../../models/Quote");
const Ticket = require("../../models/Ticket");
const TicketCategory = require("../../models/TicketCategory");
const returnCode = require("../../../config/responseCode").returnCode;

module.exports = {
  createTicket: async (req, res) => {
    try {
      const { title, ticketCategoryId, description, status, priority, attachment, category } = req.body;
      let categoryName = category;
      if (!categoryName && ticketCategoryId) {
        const ticketCategory = await TicketCategory.findById(ticketCategoryId).lean();
        if (ticketCategory) {
          categoryName = ticketCategory.name;
        }
      }

      const newTicket = new Ticket({
        title,
        ticketNumber: `#TK-${UtilController.generateRandomNumber(7)}-${UtilController.generateRandomNumber(4)}`,
        ticketCategoryId,
        category: categoryName,
        description,
        status,
        priority,
        attachment,
        organizationId: req.session.organizationId,
      });

      const savedTicket = await newTicket.save();
      res.status(201).json({ message: "Ticket created successfully", data: savedTicket });
    } catch (error) {
      console.log("error", error);

      res.status(500).json({ message: "Error creating Ticket", error: error.message });
    }
  },

  updateTicket: async (req, res, next) => {
    try {
      const updateObj = req.body;

      if (!updateObj.ticketId) {
        UtilController.sendError(req, res, next, {
          responseCode: returnCode.incompleteBody,
          message: "ticketId is required.",
        });
        return;
      }
      if (updateObj.ticketCategoryId && !updateObj.category) {
        const ticketCategory = await TicketCategory.findById(updateObj.ticketCategoryId).lean();
        if (ticketCategory) {
          updateObj.category = ticketCategory.name;
        }
      }

      updateObj["updatedAt"] = Math.floor(Date.now() / 1000);

      // Find the ticket by ticketId and update it
      const ticket = await Ticket.findByIdAndUpdate(updateObj.ticketId, updateObj, { new: true });

      // If the ticket is not found, send a 'not found' response
      if (!ticket) {
        UtilController.sendError(req, res, next, {
          responseCode: returnCode.recordNotFound,
          message: "ticket not found or update failed.",
        });
        return;
      }

      // Send success response with updated ticket data
      UtilController.sendSuccess(req, res, next, {
        message: "ticket updated successfully.",
        ticket,
        responseCode: returnCode.validSession,
      });
    } catch (error) {
      console.error("Error updating ticket:", error);
      UtilController.sendError(req, res, next, {
        message: "An error occurred while updating the event.",
        error: error.message,
        responseCode: returnCode.errror,
      });
    }
  },
  listTicket: async (req, res, next) => {
    try {
      //apply sort, search, pagination
      let search = {};

      if (!UtilController.isEmpty(req.body.keyword)) {
        search["$or"] = [{ title: { $regex: req.body.keyword, $options: "i" } }];
      }

      if (!UtilController.isEmpty(req.body.status) && req.body.status !== "all") {
        search["$or"] = [{ status: { $regex: req.body.status, $options: "i" } }];
      }

      if (!UtilController.isEmpty(req.body.priority) && req.body.priority !== "all") {
        search["$or"] = [{ priority: { $regex: req.body.priority, $options: "i" } }];
      }

      let match = {};
      if (!UtilController.isEmpty(req.session.organizationId))
        match["organizationId"] = mongoose.Types.ObjectId(req.session.organizationId);

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

      const tickets = await Ticket.aggregate([
        { $match: match },

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
            from: "ticket_categories",
            localField: "ticketCategoryId",
            foreignField: "_id",
            as: "ticketCategory",
          },
        },
        {
          $unwind: {
            path: "$ticketCategory",
            preserveNullAndEmptyArrays: true,
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
      const totalCount = tickets?.[0].totalCount?.[0] ? tickets[0].totalCount[0].count : 0;
      const rows = tickets?.[0]?.data;
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

  getTicketById: async (req, res, next) => {
    try {
      const recordId = req.body.recordId;
      let organizationId;
      if (!req.session.isSuperAdmin) {
        organizationId = req.session.organizationId;
      }

      if (!recordId) {
        return UtilController.sendError(req, res, next, {
          message: "Invalid event id",
          responseCode: returnCode.incompleteBody,
        });
      }

      let matchStage = {
        _id: mongoose.Types.ObjectId(recordId),
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
            from: "ticket_categories",
            localField: "ticketCategoryId",
            foreignField: "_id",
            as: "ticketCategory",
          },
        },
        {
          $unwind: {
            path: "$ticketCategory",
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
            title: 1,
            description: 1,
            ticketNumber: 1,
            ticketCategory: 1,
            ticketCategoryId: 1,
            status: 1,
            priority: 1,
            attachment: 1,
            createdAt: 1,
            updatedAt: 1,
            organization: 1,
            organization: {
              name: "$organization.organizationName",
              _id: "$organization._id",
            },
          },
        },
      ];

      const [result] = await Ticket.aggregate(pipeline);

      return UtilController.sendSuccess(req, res, next, {
        data: result,
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },

  getTicketCount: async (req, res, next) => {
    try {
      const TotalTickets = await Ticket.countDocuments({});
      const openTickets = await Ticket.countDocuments({ status: "open" });
      const inProgressTickets = await Ticket.countDocuments({ status: "in_progress" });
      const resolvedTickets = await Ticket.countDocuments({ status: "resolved" });
      const closedTickets = await Ticket.countDocuments({ status: "closed" });

      return UtilController.sendSuccess(req, res, next, {
        data: {
          totalTickets: TotalTickets,
          openTickets: openTickets,
          inProgressTickets: inProgressTickets,
          resolvedTickets: resolvedTickets,
          closedTickets: closedTickets,
        },
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },
};
