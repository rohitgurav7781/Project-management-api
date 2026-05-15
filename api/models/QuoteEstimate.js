const mongoose = require("mongoose");

const estimateRowSchema = new mongoose.Schema({
  description: { type: String, required: true },
  profile: { type: String, required: true },
  qty: { type: Number, default: 0 },
  estimated_weight_in_tons: { type: Number, default: 0 },
  time_element_in_min: { type: Number, default: 0 },
  total_estimate: { type: Number, default: 0 },
  repetability: { type: String, default: "" },
  total_qty: { type: Number, default: 0 },
  complexity: { type: String, default: "" },
  hrs_per_unit: { type: Number, default: 0 },
  total_time_in_hour: { type: Number, default: 0 },
});

const activitySchema = new mongoose.Schema({
  activities: { type: String, required: true },
  sub_activities: { type: String },
  qty: { type: Number, default: 0 },
  time_in_mins: { type: Number, default: 0 },
  total_estimate_in_hours: { type: Number, default: 0 },
  remark: { type: String, default: "" },
});

const quoteEstimateSchema = new mongoose.Schema({
  quoteId: { type: mongoose.Schema.Types.ObjectId },
  quoteNumber: String,
  quoteName: String,
  customerName: String,
  projectName: String,
  receivedDate: Date,
  dueDate: Date,
  structureType: String,
  complexity: String,
  measurementSystem: String,
  estimates: [[estimateRowSchema]],
  activities: [activitySchema],
  structuralHours: Number,
  miscHours: Number,
  totalHours: Number,
  inclusions: String,
  exclusions: String,
  schedule: {
    structuralWeeks: Number,
    miscellaneousWeeks: Number,
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

module.exports = mongoose.model("QuoteEstimate", quoteEstimateSchema);
