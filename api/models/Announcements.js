const mongoose = require("mongoose");
const Schema = mongoose.Schema;
AnnouncementSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
    },
    priority: {
      type: String,
      required: true,
    },
    audienceId: [
      //audience
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    description: {
      type: String,
      required: true,
    },
    expirationDate: {
      type: Number,
      default: () => Math.floor(Date.now() / 1000),
      required: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
    attachment: [],
    operatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    createdAt: {
      type: Number,
      default: () => Math.floor(Date.now() / 1000),
    },
    updatedAt: {
      type: Number,
      default: () => Math.floor(Date.now() / 1000),
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { collection: "announcements" },
);
AnnouncementSchema.index({ active: 1 });

module.exports = mongoose.model("Announcement", AnnouncementSchema);
