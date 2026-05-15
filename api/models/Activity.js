const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema({
  active: {
    type: Boolean,
    default: true,
  },
  reviewStatus: {
    type: String,
    enum: ["pending", "approved", "rejected", "deleted"],
    default: "approved",
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Project",
  },
  domain: {
    type: String,
    required: function () {
      return this.isParent;
    },
  },
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
  isParent: {
    type: Boolean,
    default: true,
  },
  attachment: [],
  subActivityAttachment: [],

  parentActivity: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Activity",
    required: function () {
      return !this.isParent;
    },
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  updatedBy: {
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
});

//will be used at main dashboard for activities since other organization employees can't see it
activitySchema.index({ organizationId: 1 });

//filters for the dashboard
activitySchema.index(
  {
    isParent: 1,
    organizationId: 1,
    projectId: 1,
    createdBy: 1,
    updatedBy: 1,
  },
  {
    name: "initial_match_index",
    background: true,
  },
);

//good for sorting
activitySchema.index({ createdAt: 1, updatedAt: 1 });

//for the subactivity of an activity
activitySchema.index({ parentActivity: 1 });

//common pattern
activitySchema.index(
  {
    organizationId: 1,
    projectId: 1,
    createdAt: -1,
  },
  {
    name: "org_project_date_index",
    background: true,
  },
);

module.exports = mongoose.model("Activity", activitySchema);
