const mongoose = require("mongoose");

const mainSteelSettingSchema = new mongoose.Schema(
  {
    mainSteelEstimate: [
      {
        assembly: { type: String, required: true },
        detail: [
          {
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
          },
        ],
      },
    ],
  },
  {
    collection: "main_steel_setting",
    timestamps: true,
  },
);

module.exports = mongoose.model("MainSteelSetting", mainSteelSettingSchema);