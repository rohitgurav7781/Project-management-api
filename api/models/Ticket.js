const mongoose = require("mongoose");
const Schema = mongoose.Schema;

ticketSchema = new Schema(
  {
    title: {
      type: String,
      default: "",
    },
    description: {
      type: String,
      default: "",
    },
    ticketNumber: {
      type: String,
      default: "",
    },
    ticketCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TicketCategory",
      required: true,
    },
    category: {
      type: String,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
    },
    status: {
      type: String,
      enum: {
        values: ["open", "pending", "in progress", "on hold", "overdue", "resolved", "closed", "completed"],
        message: "{VALUE} is not a valid status",
      },
      default: "open",

      set: val => (val ? val.toLowerCase().trim() : "open"),
    },
    priority: {
      type: String,
      enum: {
        values: ["low", "medium", "high", "critical"],
        message: "{VALUE} is not a valid priority",
      },
      set: val => (val ? val.toLowerCase().trim() : "medium"),
    },
    attachment: [],
    createdAt: {
      type: Number,
      default: () => Math.floor(Date.now() / 1000),
    },
    updatedAt: {
      type: Number,
      default: () => Math.floor(Date.now() / 1000),
    },
  },
  { collection: "tickets" },
);

ticketSchema.index({ title: 1, organizationId: 1 }, { unique: true });

module.exports = mongoose.model("Ticket", ticketSchema);
