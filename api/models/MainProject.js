const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const mainProjectSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    projectKey: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    spaceType: {
      type: String,
      default: "Team-managed software",
      trim: true,
    },
    lead: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    isStarred: {
      type: Boolean,
      default: false,
    },
    active: {
      type: Boolean,
      default: true,
    },
    operatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    createdBy: {
      type: Schema.Types.ObjectId,
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
  },
  { collection: "main_projects" },
);

mainProjectSchema.index(
  { organizationId: 1, projectKey: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);
mainProjectSchema.index({ organizationId: 1, active: 1, updatedAt: -1 });

module.exports = mongoose.model("MainProject", mainProjectSchema);
