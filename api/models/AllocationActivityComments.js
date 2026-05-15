const mongoose = require("mongoose");

const replySchema = new mongoose.Schema({
  content: {
    type: String,
    required: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  mentions: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  attachments: [
    {
      type: {
        type: String,
        default: "",
      },
      url: {
        type: String,
        default: "",
      },
      name: {
        type: String,
        default: "",
      },
    },
  ],
  createdAt: {
    type: Number,
    default: Math.floor(Date.now() / 1000),
  },
});

const allocationActivityCommentSchema = new mongoose.Schema({
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
  },
  activity: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Activity",
    required: true,
  },
  workAllocationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "WorkAllocation",
    required: true,
  },
  mentions: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  likes: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  dislikes: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  likeCount: {
    type: Number,
    default: 0,
  },
  dislikeCount: {
    type: Number,
    default: 0,
  },
  replies: [replySchema],
  attachments: [
    {
      type: {
        type: String,
        default: "",
      },
      url: {
        type: String,
        default: "",
      },
      name: {
        type: String,
        default: "",
      },
    },
  ],
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

allocationActivityCommentSchema.index({ activity: 1 });

module.exports = mongoose.model("AllocationActivityComment", allocationActivityCommentSchema);
