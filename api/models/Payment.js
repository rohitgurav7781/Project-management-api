const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const paymentSchema = new Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      //required: true,
    },
    customerName: {
      type: String,
    },
    paymentNumber: {
      type: String,
      required: true,
      unique: true,
    },

    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      //required: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      //required: true,
    },

    projectName: {
      type: String,
    },

    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      //required: true,
    },

    invoiceNumber: {
      type: String,
      required: true,
    },

    invoiceDate: {
      type: Number,
      default: () => Math.floor(Date.now() / 1000),
    },

    invoiceAmount: {
      type: Number,
      default: 0,
    },

    receivedAmount: {
      type: Number,
      default: 0,
    },

    chequeNumber: {
      type: String,
      required: true,
    },

    chequeDate: {
      type: Number,
      // required: true,
    },

    bankName: {
      type: String,
      required: true,
    },
    paymentMode: {
      type: String,
      required: true,
    },

    refNumber: {
      type: String,
      required: true,
    },

    transactionDate: {
      type: Number,
      // required: true,
    },

    balanceAmount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["Draft", "Approved", "Rejected", "Completed", "Pending"],
      default: "Draft",
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
  { collection: "payments", timestamps: true },
);

module.exports = mongoose.model("payments", paymentSchema);
