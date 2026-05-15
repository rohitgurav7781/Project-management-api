const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const itemSchema = new Schema(
  {
    slNo: {
      type: Number,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    unitRate: {
      type: Number,
      required: true,
      default: 0,
    },
    noOfHours: {
      type: Number,
      required: true,
      default: 1,
    },
    itemstotalAmount: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  { _id: false },
);

const invoiceSchema = new Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
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
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      //required: true,
    },

    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
    },
    active: {
      type: Boolean,
      default: true,
    },

    projectName: {
      type: String,
    },

    poNumber: {
      type: String,
      required: true,
    },

    poAmount: {
      type: Number,
      default: 0,
    },
    balanceAmount: {
      type: Number,
      default: 0,
    },
    items: [itemSchema],
    gstHst: {
      type: Number,
      default: 0,
    },
    gstHstPercent: {
      type: Number,
      default: 0,
    },
    subtotal: {
      type: Number,
      default: 0,
    },
    totalAmount: { type: Number, required: true },
    currency: { type: String, default: "USD" },
    currencySymbol: { type: String, default: "$" },

    status: {
      type: String,
      enum: ["Pending", "Paid", "Overdue"],
      default: "Pending",
    },
    designPo: {
      type: String,
    },
    designCor: {
      type: String,
    },
    detailingPo: {
      type: String,
    },
    detailingCor: {
      type: String,
    },
    note: {
      type: String,
    },
    // attachment: [],
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
  { collection: "invoices", timestamps: true },
);

module.exports = mongoose.model("invoices", invoiceSchema);
