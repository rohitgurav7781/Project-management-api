const mongoose = require("mongoose");
const timeEntrySchema = mongoose.Schema({
  workAllocationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "WorkAllocation",
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  tagId: {
    type: String,
    default: "",
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Projects",
  },
  projectHead: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  taskName: {
    type: String,
    default: "",
  },
  attachment: [],
  domain: {
    type: String,
    default: "",
  },
  domains: [{ type: String }],
  domainNames: [{ type: String }],
  active: {
    type: Boolean,
    default: true,
  },
  activity: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Activity",
  },
  subActivityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Activity",
  },
  subActivityName: {
    type: String, // Alternatively, you can store the subactivity's name
    default: "",
  },
  activityName: {
    type: String,
    default: "",
  },
  managerId: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  quantity: {
    type: Number,
    min: 0,
  },
  startDateTime: {
    type: Number,
    required: true,
  },
  endDateTime: {
    type: Number,
    required: true,
    // validate: {
    //   validator: function (v) {
    //     return v > this.startDateTime;
    //   },
    //   message: "End date must be after start date.",
    // },
  },
  workDescription: {
    type: String,
    default: "",
  },
  status: {
    type: String,
    default: "",
  },
  taskStatus: {
    type: String,
    default: "",
  },
  taskType: {
    type: String,
    default: "",
  },
  rejectionReason: {
    type: String,
    default: "",
  },
  approveReason: {
    type: String,
    default: "",
  },
  priority: {
    type: String,
    default: "",
  },
  breakHour: {
    type: String,
    default: "",
  },
  duration: {
    type: String,
    default: "",
  },
  ot: {
    type: String,
    default: "",
  },
  durationRequired: {
    type: Number,
    default: 0,
    set: v => v * 60,
  },
  submittedAt: {
    type: Number,
    default: () => Math.floor(Date.now() / 1000),
  },
  updatedAt: {
    type: Number,
    default: () => Math.floor(Date.now() / 1000),
  },
  createdAt: {
    type: Number,
    default: () => Math.floor(Date.now() / 1000),
  },
  operatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
});

timeEntrySchema.pre("save", function (next) {
  this.updatedAt = Math.floor(Date.now() / 1000);
  next();
});

module.exports = mongoose.model("TimeSheet", timeEntrySchema);
