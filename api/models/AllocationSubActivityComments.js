const mongoose = require("mongoose");

// Define the reply schema to embed in the main comment schema
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
  isUpdated: {
    type: Boolean,
    default: false,
  },
  updatedAt: {
    type: Number,
    default: Math.floor(Date.now() / 1000),
  },
});

const allocationSubactivityCommentSchema = new mongoose.Schema({
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
  subActivity: {
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
  replies: [replySchema], // Embed replies as objects
  likeCount: {
    type: Number,
    default: 0,
  },
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

allocationSubactivityCommentSchema.index({ subActivity: 1 });

module.exports = mongoose.model("AllocationSubActivityComment", allocationSubactivityCommentSchema);
