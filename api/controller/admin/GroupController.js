let request = require("request");
let mongoose = require("mongoose");
const Event = require("../../models/Event");
const { parsePhoneNumberFromString } = require("libphonenumber-js");
const UtilController = require("../services/UtilController");
const Quote = require("../../models/Quote");
const Group = require("../../models/Group");
const User = require("../../models/User");
const returnCode = require("../../../config/responseCode").returnCode;

module.exports = {
  createGroup: async (req, res) => {
    try {
      const { name, memberId, profileImage } = req.body;

      const newGroup = new Group({
        name,
        memberId,
        profileImage,
        organizationId: req.body.organizationId,
        createdBy: req.body.createdBy || null,
      });

      const savedGroup = await newGroup.save();

      const io = req.app.get("io");
      if (io && Array.isArray(memberId)) {
        memberId.forEach(uid => {
          io.to(`user:${String(uid)}`).emit("group:created", {
            group: savedGroup,
          });
        });
      }

      res.status(201).json({ message: "Group created successfully", data: savedGroup });
    } catch (error) {
      console.log("error", error);
      res.status(500).json({ message: "Error creating Group", error: error.message });
    }
  },

  updateGroup: async (req, res) => {
    try {
      const { groupId, name, memberId, profileImage } = req.body;

      if (!groupId) {
        return res.status(400).json({ message: "groupId is required" });
      }

      const update = {};
      if (typeof name !== "undefined") update.name = name;
      if (typeof profileImage !== "undefined") update.profileImage = profileImage;
      if (typeof memberId !== "undefined") update.memberId = memberId;

      const updatedGroup = await Group.findByIdAndUpdate(groupId, update, {
        new: true,
      });

      if (!updatedGroup) {
        return res.status(404).json({ message: "Group not found" });
      }

      res.status(200).json({ message: "Group updated successfully", data: updatedGroup });
    } catch (error) {
      console.log("error", error);
      res.status(500).json({ message: "Error updating Group", error: error.message });
    }
  },

  leaveGroup: async (req, res) => {
    try {
      const { groupId, memberId } = req.body;

      const group = await Group.findOne({ _id: groupId, memberId: memberId });

      if (!group) {
        return res.status(404).json({ message: "Group not found or member not in group" });
      }

      const updatedGroup = await Group.findByIdAndUpdate(groupId, { $pull: { memberId: memberId } }, { new: true });

      const io = req.app.get("io");
      if (io) {
        (updatedGroup.memberId || []).forEach(uid => {
          io.to(`user:${String(uid)}`).emit("group:memberLeft", {
            groupId,
            memberId,
            group: updatedGroup,
          });
        });

        io.to(`user:${String(memberId)}`).emit("group:memberLeft", {
          groupId,
          memberId,
          group: updatedGroup,
        });
      }

      res.status(200).json({ message: "Member left group successfully", data: updatedGroup });
    } catch (error) {
      console.log("error", error);

      res.status(500).json({ message: "Error for left Group", error: error.message });
    }
  },

  removeMember: async (req, res) => {
    try {
      const { groupAdminId, groupId, memberId } = req.body;

      const group = await Group.findOne({ _id: groupId, memberId: groupAdminId, memberId: memberId });

      if (!group) {
        return res.status(404).json({ message: "Group not found or member not in group" });
      }

      const updatedGroup = await Group.findByIdAndUpdate(groupId, { $pull: { memberId: memberId } }, { new: true });

      const io = req.app.get("io");
      if (io) {
        (updatedGroup.memberId || []).forEach(uid => {
          io.to(`user:${String(uid)}`).emit("group:memberRemoved", {
            groupId,
            removedMemberId: memberId,
            group: updatedGroup,
          });
        });

        io.to(`user:${String(memberId)}`).emit("group:removed", { groupId });
      }

      res.status(200).json({ message: "Member removed from this group successfully", data: updatedGroup });
    } catch (error) {
      console.log("error", error);

      res.status(500).json({ message: "Error remove member for Group", error: error.message });
    }
  },

  persons: async (req, res, next) => {
    try {
      let organizationId = req.session.organizationId || req.body.organizationId;
      let search = {};
      let match = {
        active: true,
      };
      if (!UtilController.isEmpty(organizationId)) {
        match["organizationId"] = mongoose.Types.ObjectId(organizationId);
      }

      let sort = {};
      if (!UtilController.isEmpty(req.body.sortField) && !UtilController.isEmpty(req.body.sortOrder)) {
        let sortField = req.body.sortField;
        let sortOrder = req.body.sortOrder;

        sort[sortField] = sortOrder;
      } else {
        sort = { updatedAt: -1 };
      }

      if (!UtilController.isEmpty(req.body.keyword)) {
        search["$or"] = [{ fname: { $regex: req.body.keyword, $options: "i" } }];
      }
      let pageSize = 10;
      let page = 0;
      if (!UtilController.isEmpty(req.body.pageSize)) pageSize = req.body.pageSize;
      if (!UtilController.isEmpty(req.body.page)) page = req.body.page;

      const users = await User.aggregate([
        { $match: match },
        { $match: search },
        {
          $facet: {
            totalCount: [{ $count: "count" }],
            data: [{ $sort: sort }, { $skip: page * pageSize }, { $limit: pageSize }],
          },
        },
      ]);
      const totalCount = users?.[0].totalCount?.[0] ? users[0].totalCount[0].count : 0;
      const rows = users?.[0]?.data;
      const pages = Math.ceil(totalCount / pageSize);

      UtilController.sendSuccess(req, res, next, {
        rows: rows,
        filterRecords: totalCount,
        pages: pages,
      });
    } catch (err) {
      console.error(err);
      UtilController.sendError(req, res, next, err);
    }
  },

  groups: async (req, res, next) => {
    try {
      //apply sort, search, pagination
      let search = {};

      if (!UtilController.isEmpty(req.body.keyword)) {
        search["$or"] = [{ name: { $regex: req.body.keyword, $options: "i" } }];
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

      const groups = await Group.aggregate([
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
      const totalCount = groups?.[0].totalCount?.[0] ? groups[0].totalCount[0].count : 0;
      const rows = groups?.[0]?.data;
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
