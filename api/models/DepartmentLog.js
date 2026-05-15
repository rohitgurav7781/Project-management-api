const mongoose = require("mongoose");

const departmentLogSchema = new mongoose.Schema({
  departmentId: {
    type: String,
    ref: "Department",
    required: true,
  },
  parentDepartmentId: {
    type: String,
    ref: "Department",
  },
  action: {
    type: String,
    enum: ["created", "edited", "deleted"],
    required: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    // required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("DepartmentLog", departmentLogSchema);
