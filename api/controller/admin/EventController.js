let request = require("request");
let mongoose = require("mongoose");
const Event = require("../../models/Event");
const { parsePhoneNumberFromString } = require("libphonenumber-js");
const UtilController = require("../services/UtilController");
const Quote = require("../../models/Quote");
const returnCode = require("../../../config/responseCode").returnCode;
console.log("req.body createEvent");
module.exports = {
  createEvent: async (req, res) => {
    try {
      const { title, audienceId, description, startDateTime, endDateTime, thumbnail } = req.body;
      //if (UtilController.isEmpty(req.session.organizationId)) throw { message: "Organization Id is required" };

      const newEvent = new Event({
        title,
        audienceId,
        description,
        startDateTime,
        endDateTime,
        thumbnail,
        organizationId: req.body.organizationId,
        status: "ongoing",
        createdBy: null,
      });

      const savedEvent = await newEvent.save();
      res.status(201).json({ message: "Event created successfully", data: savedEvent });
    } catch (error) {
      console.log("error", error);

      res.status(500).json({ message: "Error creating Event", error: error.message });
    }
  },

  deleteEvent: async (req, res, next) => {
    try {
      let eventId = req.body.recordId;

      await Event.updateMany(
        { _id: { $in: eventId } },
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
        message: "Event deleted successfully",
      });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },
  getEventById: async (req, res, next) => {
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
            localField: "audienceId",
            foreignField: "_id",
            as: "user",
          },
        },
        {
          $unwind: {
            path: "$users",
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
            audienceId: 1,
            user: 1,
            description: 1,
            startDateTime: 1,
            endDateTime: 1,
            thumbnail: 1,
            status: 1,
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

      const [result] = await Event.aggregate(pipeline);
      console.log("result", result);
      return UtilController.sendSuccess(req, res, next, {
        data: result,
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },

  updateEvent: async (req, res, next) => {
    try {
      const updateObj = req.body;

      // Check if eventId is provided in the request body
      if (!updateObj.eventId) {
        UtilController.sendError(req, res, next, {
          responseCode: returnCode.incompleteBody,
          message: "eventId is required.",
        });
        return;
      }

      // Add fields for operation tracking
      updateObj["operatedBy"] = req.session.userId;
      updateObj["updatedAt"] = Math.floor(Date.now() / 1000);

      // Find the po by eventId and update it
      const event = await Event.findByIdAndUpdate(updateObj.eventId, updateObj, { new: true });

      // If the po is not found, send a 'not found' response
      if (!event) {
        UtilController.sendError(req, res, next, {
          responseCode: returnCode.recordNotFound,
          message: "event not found or update failed.",
        });
        return;
      }

      // Send success response with updated po data
      UtilController.sendSuccess(req, res, next, {
        message: "event updated successfully.",
        event,
        responseCode: returnCode.validSession,
      });
    } catch (error) {
      console.error("Error updating event:", error);
      UtilController.sendError(req, res, next, {
        message: "An error occurred while updating the event.",
        error: error.message,
        responseCode: returnCode.errror,
      });
    }
  },
  listEvent: async (req, res, next) => {
    try {
      //apply sort, search, pagination
      let search = {};
      let userId = req.session.userId;
      let userType = req.session.userType;
      if (!UtilController.isEmpty(req.body.keyword)) {
        search["$or"] = [{ title: { $regex: req.body.keyword, $options: "i" } }];
      }

      let match = {
        active: true,
      };
      if (!UtilController.isEmpty(req.session.organizationId))
        match["organizationId"] = mongoose.Types.ObjectId(req.session.organizationId);
      if (!UtilController.isEmpty(req.body.active)) match["active"] = req.body.active;

      if (!UtilController.isEmpty(req.body.title)) match["title"] = mongoose.Types.ObjectId(req.body.title);

      if (!UtilController.isEmpty(req.body.startDate) || !UtilController.isEmpty(req.body.endDate)) {
        match["$and"] = [];
        if (!UtilController.isEmpty(req.body.startDate))
          match["$and"].push({ startDateTime: { $gte: req.body.startDate } });

        if (!UtilController.isEmpty(req.body.endDate)) match["$and"].push({ endDateTime: { $lte: req.body.endDate } });
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

      const events = await Event.aggregate([
        { $match: match },
        {
          $lookup: {
            from: "users",
            localField: "audienceId",
            foreignField: "_id",
            as: "user",
          },
        },
        {
          $unwind: {
            path: "$users",
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

        { $match: search },
        {
          $facet: {
            totalCount: [{ $count: "count" }],
            data: [{ $sort: sort }, { $skip: page * pageSize }, { $limit: pageSize }],
          },
        },
      ]);
      const totalCount = events?.[0].totalCount?.[0] ? events[0].totalCount[0].count : 0;
      const rows = events?.[0]?.data;
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
};
