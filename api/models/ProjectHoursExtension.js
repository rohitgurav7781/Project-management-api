const mongoose = require("mongoose");
const Schema = mongoose.Schema;
projectHoursExtensionSchema = new Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
    },
    status: {
      type: String,
      default: "open",
    },
    requestedEstimatedHours: {
      type: Number,
      required: true,
    },
    requestedProjectHours: {
      type: Number,
      required: true,
    },
    reason: {
      type: String,
      default: "",
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
  { collection: "projectHoursExtension" },
);
projectHoursExtensionSchema.index({ status: 1 });

module.exports = mongoose.model("ProjectHoursExtension", projectHoursExtensionSchema);
