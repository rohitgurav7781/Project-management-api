const mongoose = require("mongoose");

const teamsSchema = new mongoose.Schema({
  active: {
    type: Boolean,
    default: true,
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
  },
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Department",
    required: true,
  },
  departmentName: {
    type: String,
    required: true,
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  employeeName: {
    type: String,
    required: true,
  },
  // NEW FIELDS for manager-based teams
  managerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false,
  },
  managerName: {
    type: String,
    required: false,
  },
  role: {
    type: String,
    required: false,
  },
  designationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Options",
    required: false,
  },
  designationName: {
    type: String,
    required: false,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
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

//create index
teamsSchema.index({ organizationId: 1 });
teamsSchema.index({ managerId: 1 });
teamsSchema.index({ departmentId: 1, employeeId: 1, managerId: 1 });

module.exports = mongoose.model("Teams", teamsSchema);
