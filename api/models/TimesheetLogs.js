const mongoose = require("mongoose");

const timeSheetLogSchema = new mongoose.Schema(
  {
    timeSheetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TimeSheet",
      required: true,
    },
    action: {
      type: String,
      required: true,
    },
    rejectionReason: {
      type: String,
      default: "",
    },
    approveReason: {
      type: String,
      default: "",
    },
    operatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    timestamp: {
      type: Number,
      default: () => Math.floor(Date.now() / 1000),
    },
    changes: {
      type: Object,
      default: {},
    },
  },
  {
    collection: "timesheet_logs",
  },
);

timeSheetLogSchema.pre("save", function (next) {
  this.timestamp = Math.floor(Date.now() / 1000);
  next();
});

module.exports = mongoose.model("TimeSheetLog", timeSheetLogSchema);
