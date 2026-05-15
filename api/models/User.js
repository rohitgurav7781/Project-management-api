const mongoose = require("mongoose");
const { isEmail, isMobilePhone } = require("validator");

const userSchema = mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
    },
   
    departmentId: {
      type: String,
      default: "",
    },
    subDepartmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
    },
    employeeId: {
      type: String,
      default: "",
    },
    isDepartmentHead: {
      type: Boolean,
      default: false,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    dateOfJoining: {
      type: Number,
      default: 0,
    },
    fname: {
      type: String,
      required: true,
    },
    lname: {
      type: String,
    },
    email: {
      type: String,
      default: "",
    },
    password: {
      type: String,
      required: true,
    },
    fcmToken: {
      type: String,
      default: "",
    },
    mobileNo: {
      type: String,
      default: "",
    },
    alternativeNo: {
      type: String,
      default: "",
    },
    position: {
      type: String,
      default: "",
    },
    active: {
      type: Boolean,
      default: true,
    },
    archived: {
      type: Boolean,
      default: false,
    },
    userType: {
      type: String,
      default: "",
    },
   
    reportedTo: {
      type: String,
      default: "",
    },
    reportingManagerName: {
      type: String,
      default: "",
    },
    reportingManagerNameID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    status: {
      type: String,
      default: "pending",
    },
    domain: {
      type: String,
      default: "",
    },
    profileImage: {
      type: String,
      default: "",
    },
    socketId: {
      type: String,
      default: "",
    },
    gender: {
      type: String,
      default: "",
    },
    totalExp: {
      type: String,
      default: "",
    },
    dob: {
      type: Number,
      default: 0,
    },
    state: {
      type: String,
      default: "",
    },
   
    permission: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Role",
      },
    ],
    isSuperAdmin: {
      type: Boolean,
      default: false,
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    passwordAttempt: {
      type: Number,
      default: 0,
    },
    passwordReset: {
      type: Boolean,
      default: false,
    },
    rejectionReason: {
      type: String,
      default: "",
    },
    countryCode: {
      type: String,
      default: "",
    },
    operatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    updatedAt: {
      type: Number,
      default: () => Math.floor(Date.now() / 1000),
    },
    createdAt: {
      type: Number,
      default: () => Math.floor(Date.now() / 1000),
    },
    organizationName: {
      type: String,
      default: "",
    },
    department: {
      type: String,
      default: "",
    },

    permissionName: {
      type: String,
      default: "",
    },
    customFields: [
      {
        field: {
          type: String,
          default: "",
        },
        value: {
          type: String,
          default: "",
        },
      },
    ],

    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        default: [0, 0],
      },
      fragmentedAddress: {
        type: String,
        default: "",
      },
    },
  },
  {
    collection: "users",
  },
);

userSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("User", userSchema);
