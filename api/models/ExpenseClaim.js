const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const expenseClaimSchema = new Schema(
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
    },
    position: {
      type: String,
      default: "",
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
    },
    managerId: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
    },
    expenseTitle: {
      type: String,
      required: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExpenseCategory",
    },
    category: {
      type: String,
    },
    amount: {
      type: Number,
      required: true,
    },
    expenseDate: {
      type: Number,
      required: true,
    },
    description: {
      type: String,
    },
    attachment: {
      type: [String],
      default: [],
    },

    // Main status (final approval by admin)
    status: {
      type: String,
      enum: ["Approved", "Rejected", "Pending", "Cancelled"],
      default: "Pending",
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

    managerStatus: {
      type: String,
      enum: ["Pending", "Manager Approved", "Manager Rejected"],
      default: "Pending",
    },
    managerRejectedReason: {
      type: String,
      default: "",
    },
    managerRejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    managerRejectedAt: {
      type: Number,
    },
    managerApprovedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    managerApprovedAt: {
      type: Number,
    },

    // System fields
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
    operatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { collection: "expense_claims" },
);

module.exports = mongoose.model("ExpenseClaim", expenseClaimSchema);
