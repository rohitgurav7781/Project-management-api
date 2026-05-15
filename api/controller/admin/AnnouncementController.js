let request = require("request");
let mongoose = require("mongoose");
const Announcement = require("./../../models/Announcements");
const { parsePhoneNumberFromString } = require("libphonenumber-js");
const UtilController = require("../services/UtilController");
const Quote = require("../../models/Quote");
const returnCode = require("../../../config/responseCode").returnCode;

module.exports = {
  createAnnouncement: async (req, res) => {
    try {
      const { title, priority, description, expirationDate, audienceId, attachment } = req.body;
      if (UtilController.isEmpty(req.session.organizationId)) throw { message: "Organization Id is required" };

      const newAnnouncement = new Announcement({
        organizationId: req.session.organizationId,
        audienceId,
        title,
        priority,
        description,
        expirationDate,
        attachment,
      });

      const savedAnnouncement = await newAnnouncement.save();
      res.status(201).json({ message: "Announcement created successfully", data: savedAnnouncement });
    } catch (error) {
      res.status(500).json({ message: "Error creating Announcement", error: error.message });
    }
  },

  deleteAnnouncement: async (req, res, next) => {
    try {
      let announcementId = req.body.recordId;

      if (!announcementId) {
        return UtilController.sendError(req, res, next, {
          message: "Announcement ID is required",
        });
      }

      const result = await Announcement.updateMany(
        { _id: { $in: [announcementId] } },
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
        message: "Announcement deleted successfully",
        data: result,
      });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },

  getAnnouncementById: async (req, res, next) => {
    try {
      const recordId = req.body.recordId;
      let organizationId;
      if (!req.session.isSuperAdmin) {
        organizationId = req.session.organizationId;
      }

      if (!recordId) {
        return UtilController.sendError(req, res, next, {
          message: "Invalid Announcement id",
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
            priority: 1,
            description: 1,
            expirationDate: 1,
            audienceId: 1,
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

      const [result] = await Announcement.aggregate(pipeline);
      console.log("result", result);
      return UtilController.sendSuccess(req, res, next, {
        data: result,
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },

  updateAnnouncement: async (req, res, next) => {
    try {
      const updateObj = req.body;

      if (!updateObj.announcementId) {
        UtilController.sendError(req, res, next, {
          responseCode: returnCode.incompleteBody,
          message: "announcementId is required.",
        });
        return;
      }

      // Add fields for operation tracking
      updateObj["operatedBy"] = req.session.userId;
      updateObj["updatedAt"] = Math.floor(Date.now() / 1000);

      // Find the announcement by announcementId and update it
      const announcement = await Announcement.findByIdAndUpdate(updateObj.announcementId, updateObj, { new: true });

      // If the announcement is not found, send a 'not found' response
      if (!announcement) {
        UtilController.sendError(req, res, next, {
          responseCode: returnCode.recordNotFound,
          message: "announcement not found or update failed.",
        });
        return;
      }

      // Send success response with updated announcement data
      UtilController.sendSuccess(req, res, next, {
        message: "announcement updated successfully.",
        announcement,
        responseCode: returnCode.validSession,
      });
    } catch (error) {
      console.error("Error updating announcement:", error);
      UtilController.sendError(req, res, next, {
        message: "An error occurred while updating the announcement.",
        error: error.message,
        responseCode: returnCode.errror,
      });
    }
  },
  listAnnouncement: async (req, res, next) => {
    try {
      //apply sort, search, pagination
      let search = {};
      let userId = req.session.userId;
      let userType = req.session.userType;
      if (!UtilController.isEmpty(req.body.keyword)) {
        search["$or"] = [
          { title: { $regex: req.body.keyword, $options: "i" } },
          { name: { $regex: req.body.keyword, $options: "i" } },
        ];
      }

      let match = {
        active: true,
      };
      if (!UtilController.isEmpty(req.session.organizationId))
        match["organizationId"] = mongoose.Types.ObjectId(req.session.organizationId);
      if (!UtilController.isEmpty(req.body.active)) match["active"] = req.body.active;

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

      const announcements = await Announcement.aggregate([
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
        { $match: search },
        {
          $facet: {
            totalCount: [{ $count: "count" }],
            data: [{ $sort: sort }, { $skip: page * pageSize }, { $limit: pageSize }],
          },
        },
      ]);
      const totalCount = announcements?.[0].totalCount?.[0] ? announcements[0].totalCount[0].count : 0;
      const rows = announcements?.[0]?.data;
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
