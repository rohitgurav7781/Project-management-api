const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const spaceIssueSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    mainProjectId: {
      type: Schema.Types.ObjectId,
      ref: "MainProject",
      required: true,
    },
    issueKey: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    parentIssueId: {
      type: Schema.Types.ObjectId,
      ref: "SpaceIssue",
      default: null,
    },
    issueType: {
      type: String,
      default: "task",
      trim: true,
    },
    statusKey: {
      type: String,
      default: "TODO",
      trim: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    assignee: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    active: {
      type: Boolean,
      default: true,
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
  { collection: "space_issues" },
);

spaceIssueSchema.index({ mainProjectId: 1, active: 1, statusKey: 1, sortOrder: 1 });
spaceIssueSchema.index({ parentIssueId: 1, active: 1 });
spaceIssueSchema.index(
  { mainProjectId: 1, issueKey: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);

module.exports = mongoose.model("SpaceIssue", spaceIssueSchema);
