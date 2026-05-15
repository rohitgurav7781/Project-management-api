const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const CORSchema = new Schema(
  {
    corNumber: {
      type: String,
      required: true,
      unique: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    customerName: {
      type: String,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    projectName: {
      type: String,
    },

    poId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PO",
      required: true,
    },
    poNumber: {
      type: String,
      required: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
    corApprovedDate: {
      type: Number,
    },
    corAmount: {
      type: Number,
      default: 0,
    },
    revisedPOAmount: {
      type: Number,
      default: 0,
    },
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
    coPo: {
      type: String,
    },
    designedCor: {
      type: String,
    },
    detailingCor: {
      type: String,
    },
    attachment: [],
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
  { collection: "cors", timestamps: true },
);

module.exports = mongoose.model("cors", CORSchema);
