const mongoose = require("mongoose");

const workAllocationSchema = mongoose.Schema(
  {
   
    employeeId: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    tagId: {
      type: String,
      default: "",
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Projects",
      required: true,
    },
    domains: [{type: mongoose.Schema.Types.ObjectId, ref:"Domain"}],
    domainNames:[{type:String}],
    
    taskName: {
      type: String,
      default: "",
    },
    active: {
      type: Boolean,
      default: true,
    },
    activity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Activity",
      required: true,
    },
    subActivityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Activity",
      // required: true,
    },
    subActivityName: {
      type: String, // Alternatively, you can store the subactivity's name
      //required: true,
    },
    attachment: [],
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
    priority: {
      type: String,
      default: "",
    },
    duration: {
      type: String,
      default: "",
    },
    breakHour: {
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
    timesheetRefIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TimeSheet",
      },
    ],
    notifications: [
      {
        message: {
          type: String,
          required: true,
        },
        type: {
          type: String,
          enum: ["Submission", "Approval", "Rejection"],
          required: true,
        },
        timestamp: {
          type: Date,
          default: () => Math.floor(Date.now() / 1000),
        },
        read: {
          type: Boolean,
          default: false,
        },
      },
    ],
  },
  {
    collection: "workallocations",
  },
);
workAllocationSchema.index({ employeeId: 1, active: 1, taskStatus: 1 });
// Automatically update `updatedAt` field on save
workAllocationSchema.pre("save", function (next) {
  this.updatedAt = Math.floor(Date.now() / 1000);
  next();
});

module.exports = mongoose.model("WorkAllocation", workAllocationSchema);
