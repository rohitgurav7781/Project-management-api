const mongoose = require("mongoose");
const Schema = mongoose.Schema;
projectSchema = new Schema(
  {
    projectTagId: {
      type: String,
      required: true,
    },
    taskName: {
      type: String,
      default: "",
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
    },
    active: {
      type: Boolean,
      default: true,
    },
    projectName: {
      type: String,
      required: true,
    },
    projectNumber: {
      type: String,
      required: true,
    },
    estimatedHours: {
      type: Number,
      required: true,
    },
    projectHours: {
      type: Number,
      required: true,
    },
    projectDescription: {
      type: String,
    },
    startDate: {
      type: Number,
      // required: true,
    },
    endDate: {
      type: Number,
      // required: true,
    },
    customerContacts: [
      {
        personName: { type: String, default: "" },
        phoneNo: { type: String, default: "" },
      },
    ],
    projectStatus: {
      type: String,
      default: "Open",
    },

    projectHead: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    team: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    attachment: [],
    note: {
      type: String,
    },
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
  { collection: "projects" },
);
projectSchema.index({ projectHead: 1, projectStatus: 1, active: 1 });

module.exports = mongoose.model("Projects", projectSchema);
