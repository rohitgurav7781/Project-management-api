const mongoose = require("mongoose");

const mentionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

const activityCommentSchema = new mongoose.Schema({
  active: {
    type: Boolean,
    default: true,
  },
  content: {
    type: String,
    required: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  activity: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Activity",
    required: true,
  },
  mentions: [mentionSchema],
  attachments: [String],
  createdAt: {
    type: Number,
    default: Math.floor(Date.now() / 1000),
  },
  isUpdated: {
    type: Boolean,
    default: false,
  },
  updatedAt: {
    type: Number,
    default: Math.floor(Date.now() / 1000),
  },
});

activityCommentSchema.index({ activity: 1 });

module.exports = mongoose.model("ActivityComment", activityCommentSchema);
