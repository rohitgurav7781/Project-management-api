const { Logger } = require("mongodb");
let mongoose = require("mongoose");
const Notification = require("./../../models/Notification");
const UtilController = require("../services/UtilController");

module.exports = {
  queryAllNotification: async (req, res, next) => {
    try {
      const { isSuperAdmin, userType, userId, organizationId } = req.session;

      const pageLength = 15;
      let skipVal = 0;

      if (req.query.pageNo) {
        skipVal = pageLength * Number(req.query.pageNo);
      }

      let finalQuery = {
        read: false,
        userId: mongoose.Types.ObjectId(userId),
      };

      if (["organization admin", "admin"].includes(userType.toLowerCase())) {
        finalQuery.organizationId = organizationId;
      } else if (["manager", "employee"].includes(userType.toLowerCase())) {
        finalQuery.userType = { $regex: new RegExp(userType, "i") };
      } else if (userType.toLowerCase() === "admin" && isSuperAdmin) {
        finalQuery.userType = { $in: ["superAdmin", "admin"] };
      }

      finalQuery.$or = [
        { userId: mongoose.Types.ObjectId(userId) }, // normal notifications
        { userId: mongoose.Types.ObjectId(userId), type: "chat" }, // chat notifications
      ];

      const result = await Notification.find(finalQuery).sort({ updatedAt: -1 }).skip(skipVal).limit(pageLength);

      const notificationCount = await Notification.countDocuments(finalQuery);

      UtilController.sendSuccess(req, res, next, {
        result,
        pages: Math.ceil(notificationCount / pageLength),
        notificationCount,
      });
    } catch (err) {
      console.error(err);
      UtilController.sendError(req, res, next, err);
    }
  },

  markAsRead: async (req, res, next) => {
    try {
      let result = await Notification.findByIdAndUpdate(
        {
          _id: mongoose.Types.ObjectId(req.query.recordId),
          read: false,
        },
        {
          read: true,
        },
      );

      UtilController.sendSuccess(req, res, next, {
        result,
      });
    } catch (err) {
      console.error(err);
      UtilController.sendError(req, res, next, err);
    }
  },

  unreadNotificationCount: async (req, res, next) => {
    try {
      const { userType, userId, organizationId, isSuperAdmin } = req.session;

      let finalQuery = {
        read: false,
        userId: mongoose.Types.ObjectId(userId),
      };

      if (userType === "Organization Admin") {
        finalQuery.organizationId = mongoose.Types.ObjectId(organizationId);
      } else if (["Manager", "Employee"].includes(userType)) {
        finalQuery.userType = { $regex: new RegExp(userType, "i") };
      } else if (userType === "Admin" && isSuperAdmin) {
        finalQuery.userType = { $in: ["superAdmin", "Admin"] };
      }

      const notificationCount = await Notification.countDocuments(finalQuery);

      UtilController.sendSuccess(req, res, next, {
        notificationCount,
      });
    } catch (err) {
      console.error(err);
      UtilController.sendError(req, res, next, err);
    }
  },

  markAllAsRead: async (req, res, next) => {
    try {
      const { isSuperAdmin, userType, userId, organizationId } = req.session;
      const query = { read: false };

      if (!userType || !userId) {
        return UtilController.sendError(req, res, next, {
          message: "User type or user ID missing in session",
        });
      }

      if (userType === "Organization Admin") {
        query.userType = "organizationAdmin";
        query.organizationId = req.session.organizationId;
      } else if (["Manager", "Employee"].includes(userType)) {
        query.userType = { $regex: new RegExp(userType, "i") };
        query.userId = mongoose.Types.ObjectId(userId);
      } else if (userType === "admin" && isSuperAdmin) {
        query.userType = { $in: ["superAdmin", "admin"] };
      }

      // ✅ FIX 3: Include chat notifications in mark all as read
      const { read: _, ...roleConditions } = query;
      const finalQuery = {
        read: false,
        $or: [roleConditions, { userId: mongoose.Types.ObjectId(userId), type: "chat" }],
      };

      const result = await Notification.updateMany(finalQuery, { read: true });

      if (result.modifiedCount === 0) {
        return UtilController.sendSuccess(req, res, next, {
          message: "No notifications to mark as read.",
        });
      }

      UtilController.sendSuccess(req, res, next, {
        message: "All notifications marked as read!",
      });
    } catch (err) {
      console.error(err);
      UtilController.sendError(req, res, next, {
        message: "An error occurred while updating notifications.",
        error: err,
      });
    }
  },
};