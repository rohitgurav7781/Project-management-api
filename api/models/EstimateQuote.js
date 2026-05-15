const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema({
  description: { type: String,  },
  profile: { type: String },
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

const otherActivitySchema = new mongoose.Schema({
  activities: { type: String},
  sub_activities: { type: String },
  qty: { type: Number, default: 0 },
  time_in_mins: { type: Number, default: 0 },
  total_estimate_in_hours: { type: Number, default: 0 },
  remark: { type: String, default: "" },
});

const EstimateQuoteSchema = new mongoose.Schema(
  {
    quoteId: { type: mongoose.Schema.Types.ObjectId },
    quoteName: String,
    customerName: String,
    projectName: String,
    receivedDate: String,
    dueDate: String,
    structureType: String,
    complexity: String,
    measurementSystem: String,
    estimates: [
      {
        title: String,
        activities: [activitySchema],
        otherActivities: [otherActivitySchema],
        structuralHrs: Number,
        miscHrs: Number,
        totalHrs: Number,
        sowInclusion: String,
        sowExclusion: String,
        schedStructural: String,
        schedMisc: String,
      },
    ],
  },
  { timestamps: true },
);

module.exports = mongoose.model("EstimateQuote", EstimateQuoteSchema);
