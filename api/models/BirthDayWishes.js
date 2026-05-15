const mongoose = require("mongoose");

const birthdayWishSchema = mongoose.Schema(
  {
    birthdayUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    birthdayUserName: {
      type: String,
      default: "",
    },
    birthdayDate: {
      type: Number, // Epoch timestamp in seconds
      required: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
    },
    wishes: [
      {
        senderId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        senderName: {
          type: String,
          default: "",
        },
        senderProfileImage: {
          type: String,
          default: "",
        },
        senderPosition: {
          type: String,
          default: "",
        },
        message: {
          type: String,
          required: true,
        },
        wishType: {
          type: String,
          enum: ["text", "emoji", "custom"],
          default: "text",
        },
        isRead: {
          type: Boolean,
          default: false,
        },
        sentAt: {
          type: Number,
          default: () => Math.floor(Date.now() / 1000),
        },
      },
    ],
    totalWishes: {
      type: Number,
      default: 0,
    },
    active: {
      type: Boolean,
      default: true,
    },
    year: {
      type: Number,
      required: true,
    },
    operatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedAt: {
      type: Number,
      default: () => Math.floor(Date.now() / 1000),
    },
    createdAt: {
      type: Number,
      default: () => Math.floor(Date.now() / 1000),
    },
  },
  {
    collection: "birthdaywishes",
  },
);

// Index for quick birthday lookups
birthdayWishSchema.index({ birthdayUserId: 1, year: 1 });
birthdayWishSchema.index({ birthdayDate: 1, active: 1 });
birthdayWishSchema.index({ organizationId: 1, birthdayDate: 1 });

module.exports = mongoose.model("BirthdayWish", birthdayWishSchema);
