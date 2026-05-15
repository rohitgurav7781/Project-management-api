const mongoose = require("mongoose");
const Schema = mongoose.Schema;
TicketCategorySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
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
    
  },
  { collection: "ticket_categories" },
);
TicketCategorySchema.index({ active: 1, name: 1 });

module.exports = mongoose.model("TicketCategory", TicketCategorySchema);
