const mongoose = require("mongoose");

const otherActivitySchema = new mongoose.Schema(
  {
    other_activities: [
      {

            "activities" :{ type: String, required: true },
            "sub_activities" : { type: String},
            "qty" : { type: Number, default: 0 },
            "time_in_mins" :  { type: Number, default: 0 },
            "total_estimate_in_hours" :  { type: Number, default: 0 },
            "remark" : { type: String, default: "" },
      },
    ],
  },
  {
    collection: "other_activities",
    timestamps: true,
  },
);

module.exports = mongoose.model("OtherActivity", otherActivitySchema);
