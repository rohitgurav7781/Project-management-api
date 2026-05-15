const BirthDayWishes = require("../../models/BirthDayWishes");
const User = require("../../models/User");
const Notification = require("../../models/Notification");
const UtilController = require("../services/UtilController");
const mongoose = require("mongoose");

module.exports = {
  sendBirthdayWish: async (req, res, next) => {
    try {
      const { userId, userType, birthdayUserId, message, wishType } = req.body;

      if (!userId || !userType) {
        return UtilController.sendError(req, res, next, "User ID and User Type are required");
      }

      if (!birthdayUserId || !message) {
        return UtilController.sendError(req, res, next, "Birthday User ID and Message are required");
      }

      const allowedUserTypes = ["Employee", "Manager", "Admin", "Organization Admin", "TLS"];
      if (!allowedUserTypes.map(type => type.toLowerCase()).includes(userType?.toLowerCase())) {
        return UtilController.sendError(req, res, next, "Invalid User Type");
      }

      // Verify sender
      const sender = await User.findOne({ _id: userId, active: true });
      if (!sender) {
        return UtilController.sendError(req, res, next, "Sender not found");
      }

      // Verify birthday user
      const birthdayUser = await User.findOne({ _id: birthdayUserId, active: true });
      if (!birthdayUser) {
        return UtilController.sendError(req, res, next, "Birthday user not found");
      }

      // Check if it's actually the user's birthday
      const today = new Date();
      const currentMonth = today.getMonth() + 1;
      const currentDay = today.getDate();
      const currentYear = today.getFullYear();

      const dobDate = new Date(birthdayUser.dob * 1000);
      const birthMonth = dobDate.getMonth() + 1;
      const birthDay = dobDate.getDate();

      // if (birthMonth !== currentMonth || birthDay !== currentDay) {
      //   return UtilController.sendError(req, res, next, "Today is not this user's birthday");
      // }

      const currentTime = Math.floor(Date.now() / 1000);

      // Create wish object
      const newWish = {
        senderId: userId,
        senderName: `${sender.fname} ${sender.lname || ""}`.trim(),
        senderProfileImage: sender.profileImage || "",
        senderPosition: sender.position || "",
        message: message.trim(),
        wishType: wishType || "text",
        isRead: false,
        sentAt: currentTime,
      };

      let birthdayWish = await BirthDayWishes.findOne({
        birthdayUserId: birthdayUserId,
        year: currentYear,
        active: true,
      });

      if (birthdayWish) {
        birthdayWish.wishes.push(newWish);
        birthdayWish.totalWishes = birthdayWish.wishes.length;
        birthdayWish.updatedAt = currentTime;
        birthdayWish.operatedBy = userId;
        await birthdayWish.save();
      } else {
        birthdayWish = await BirthDayWishes.create({
          birthdayUserId: birthdayUserId,
          birthdayUserName: `${birthdayUser.fname} ${birthdayUser.lname || ""}`.trim(),
          birthdayDate: birthdayUser.dob,
          organizationId: birthdayUser.organizationId,
          year: currentYear,
          wishes: [newWish],
          totalWishes: 1,
          active: true,
          createdBy: userId,
          operatedBy: userId,
          createdAt: currentTime,
          updatedAt: currentTime,
        });
      }

      const isReply = userId.toString() === birthdayUserId.toString();

      if (!isReply) {
        const senderFullName = `${sender.fname} ${sender.lname || ""}`.trim();
        await Notification.create({
          userId: birthdayUserId,
          senderId: userId,
          title: `Birthday Wish from ${senderFullName}`,
          body: `${senderFullName} has wished you a Happy Birthday! "${message}"`,
          type: "system",
          read: false,
          visibleOnHome: true,
          actionUrl: `/birthday-wishes?id=${birthdayWish._id}`,
          recordId: birthdayWish._id,
          userType: birthdayUser.userType?.toLowerCase() || "employee",
          organizationId: birthdayUser.organizationId,
        });
      }

      const responseData = {
        success: true,
        message: "Birthday wish sent successfully",
        birthdayWishId: birthdayWish._id,
        wish: {
          senderId: newWish.senderId,
          senderName: newWish.senderName,
          senderProfileImage: newWish.senderProfileImage,
          senderPosition: newWish.senderPosition,
          message: newWish.message,
          wishType: newWish.wishType,
          sentAt: newWish.sentAt,
        },
        totalWishes: birthdayWish.totalWishes,
      };

      UtilController.sendSuccess(req, res, next, responseData);
    } catch (error) {
      console.error("Error sending birthday wish:", error);
      UtilController.sendError(req, res, next, "An error occurred while sending birthday wish");
    }
  },

  getBirthdayWishes: async (req, res, next) => {
    try {
      const { userId, userType, birthdayUserId, year } = req.body;

      if (!userId || !userType) {
        return UtilController.sendError(req, res, next, "User ID and User Type are required");
      }

      if (!birthdayUserId) {
        return UtilController.sendError(req, res, next, "Birthday User ID is required");
      }

      const allowedUserTypes = ["Employee", "Manager", "Admin", "Organization Admin", "TLS"];
      if (!allowedUserTypes.map(type => type.toLowerCase()).includes(userType?.toLowerCase())) {
        return UtilController.sendError(req, res, next, "Invalid User Type");
      }

      const user = await User.findOne({ _id: userId });
      if (!user) {
        return UtilController.sendError(req, res, next, "User not found");
      }

      const targetYear = year || new Date().getFullYear();

      const birthdayWish = await BirthDayWishes.findOne({
        birthdayUserId: mongoose.Types.ObjectId(birthdayUserId),
        year: targetYear,
        active: true,
      }).populate("birthdayUserId", "fname lname email profileImage position department");

      if (!birthdayWish) {
        return UtilController.sendSuccess(req, res, next, {
          birthdayUser: null,
          wishes: [],
          totalWishes: 0,
          message: "No birthday wishes found",
        });
      }

      const sortedWishes = birthdayWish.wishes.sort((a, b) => a.sentAt - b.sentAt);

      const responseData = {
        birthdayUser: {
          userId: birthdayWish.birthdayUserId._id,
          name: `${birthdayWish.birthdayUserId.fname} ${birthdayWish.birthdayUserId.lname || ""}`.trim(),
          email: birthdayWish.birthdayUserId.email,
          profileImage: birthdayWish.birthdayUserId.profileImage,
          position: birthdayWish.birthdayUserId.position,
          department: birthdayWish.birthdayUserId.department,
        },
        wishes: sortedWishes.map(wish => ({
          senderId: wish.senderId,
          senderName: wish.senderName,
          senderProfileImage: wish.senderProfileImage,
          senderPosition: wish.senderPosition,
          message: wish.message,
          wishType: wish.wishType,
          sentAt: wish.sentAt,
          isRead: wish.isRead,
        })),
        totalWishes: birthdayWish.totalWishes,
        year: birthdayWish.year,
      };

      UtilController.sendSuccess(req, res, next, responseData);
    } catch (error) {
      console.error("Error fetching birthday wishes:", error);
      UtilController.sendError(req, res, next, "An error occurred while fetching birthday wishes");
    }
  },
};
