const mongoose = require("mongoose");
const Schema = mongoose.Schema;
leaveTypeSchema = new Schema(
  {
    name: {
      type: String,
      required: true,  // paid leave , sick leave
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      //required: true,
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
  { collection: "leave_types" },
);
leaveTypeSchema.index({ active: 1, name: 1 });

module.exports = mongoose.model("LeaveType", leaveTypeSchema);
