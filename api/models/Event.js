const mongoose = require("mongoose");
const Schema = mongoose.Schema;
eventSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    audienceId: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    active: {
      type: Boolean,
      default: true,
    },
    description: {
      type: String,
      required: true,
    },
    startDateTime: {
      type: Number,
      required: true,
    },
    endDateTime: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: ["ongoing", "upcoming", "completed"],
      default: "ongoing",
    },
    thumbnail: [],
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
  { collection: "events" },
);
eventSchema.index({ active: 1 });

module.exports = mongoose.model("Event", eventSchema);