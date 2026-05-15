const mongoose = require("mongoose");

const quoteSchema = new mongoose.Schema(
  {
    quoteNumber: {
      type: String,
      required: true,
      unique: true,
    },
    quoteName: {
      type: String,
      required: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    customerName: {
      type: String,
    },
    customerNumber: {
      type: String,
    },
    active: {
      type: Boolean,
      default: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },

    projectName: {
      type: String,
      required: true,
    },
    mtoIncluded: {
      type: Boolean,
      default: false,
    },
    connectionDesignIncluded: {
      type: Boolean,
      default: false,
    },
    quoteReceivedDate: {
      type: Number,
      required: true,
    },
    quoteDueDate: {
      type: Number,
      required: true,
    },
    remarks: {
      type: String,
    },
    structuralPrice: {
      type: Number,
      default: 0,
    },
    miscellaneousPrice: {
      type: Number,
      default: 0,
    },
    totalQuoteAmount: {
      type: Number,
      default: 0,
    },
    finalQuoteAmount: {
      type: Number,
      default: 0,
    },
    remarkAdditional: {
      type: String,
    },
     status: {
      type: String,
      enum: ["Draft","Quote Created","Estimate", "Quote Rejected", "Quote in Review", "Quote on Hold", "Quote Approved"],
      default: "Draft",
    },
    rejectionReason: {
      type: String,
    },
    attachment:[],
    note:{
      type:String
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      //required: true,
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
  },
  {
    collection: "quotes",
    timestamps: true,
  },
);

module.exports = mongoose.model("Quote", quoteSchema);
