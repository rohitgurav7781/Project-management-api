const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const leaveRequestSchema = new Schema(
  {
    employeeName: {
      type: String,
      required: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    employeeCode: {
      type: String,
      // trim: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
    },
    managerId: {
      type: [mongoose.Schema.Types.ObjectId], // Changed to array
      ref: "User",
      required: true,
    },
    leaveTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LeaveType",
    },
    startDate: {
      type: Number,
    },
    endDate: {
      type: Number,
    },
    status: {
      type: String,
      enum: ["Approved", "Rejected", "Pending", "Cancelled"],
      default: "Pending",
    },
    totalDays: {
      type: Number,
    },
    totalBreakHours: {
      type: Number,
      default: 0,
    },
    leaveType: {
      type: String,
    },
    breakDate: {
      type: Number,
    },
    breakHours: {
      type: Number,
    },
    breakreason: {
      type: String,
    },
    reason: {
      type: String,
    },
    rejectedReason: {
      type: String,
      default: "",
    },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    rejectedAt: {
      type: Number,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    approvedAt: {
      type: Number,
    },
    active: {
      type: Boolean,
      default: true,
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
  { collection: "leave_requests" },
);

module.exports = mongoose.model("LeaveRequest", leaveRequestSchema);
