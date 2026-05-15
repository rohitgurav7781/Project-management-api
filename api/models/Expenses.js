const mongoose = require("mongoose");
const Schema = mongoose.Schema;
expensesSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      //required: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    category: {
      type: String,
    },
    date: {
      type: Number,
    },
    receipt: [],
    status: {
      type: String,
      enum: ["Approved", "Rejected", "Pending", "Cancelled"],
      default: "Pending",
    },
    description: {
      type: String,
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
  { collection: "expenses" },
);

module.exports = mongoose.model("Expenses", expensesSchema);
