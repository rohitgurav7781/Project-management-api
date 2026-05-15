const mongoose = require("mongoose");

const pricingSchema = new mongoose.Schema({
  category: String,
  hours: Number,
  rate: Number,
  amount: Number,
  note: String,
});

const quotePricingSchema = new mongoose.Schema({
  quoteId: { type: mongoose.Schema.Types.ObjectId },
  quoteName: String,
  customerName: String,
  projectName: String,
  receivedDate: String,
  dueDate: String,
  pricing: [pricingSchema],
  totalPrice: Number,
  submittedQuotePrice: String,
});

module.exports = mongoose.model("QuotePricing", quotePricingSchema);
