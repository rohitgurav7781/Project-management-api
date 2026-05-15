const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const poSchema = new Schema(
  {
    poNumber: {
      type: String,
      required: true,
      unique: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    customerName: {
      type: String,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    quoteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quote",
      //required: true,
    },
    quoteNumber: {
      type: String,
      // required: true,
    },

    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    projectName: {
      type: String,
      // required: true,
    },
    active: {
      type: Boolean,
      default: true,
    },

    poDate: {
      type: Number,
      default: () => Math.floor(Date.now() / 1000),
    },

    detailingAmount: {
      type: Number,
      default: 0,
    },

    designAmount: {
      type: Number,
      default: 0,
    },

    designVendor: {
      type: Number,
      default: 0,
    },

    cToUsica: {
      type: Number,
      default: 0,
    },

    cToClient: {
      type: Number,
      default: 0,
    },

    attachment: [],

    status: {
      type: String,
      enum: [
        "open",
        "allocated",
        "reopened",
        "archived",
        "draft",
        "approved",
        "rejected",
        "completed",
        "pending",
        "on_hold",
      ],
      default: "Draft",
    },

    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    jobNumber: {
      type: String,
    },
    clientPoNumber: {
      type: String,
    },
    team: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    designedPo: {
      type: String,
    },
    detailingPo: {
      type: String,
    },
    note: {
      type: String,
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
  { collection: "pos", timestamps: true },
);

module.exports = mongoose.model("pos", poSchema);
