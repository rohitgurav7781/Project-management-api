const mongoose = require("mongoose");

let notificationSchema = mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User", // this is userId, one who received  notification
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User", // this senderId will empty or null for System generate notification and else it will be admin user id who triggered notification
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization"
  },
  visibleOn: Array,
  title: String,
  body: String,
  subject: String,
  icon: String,
  poster: String,
  recordId: {
    type: mongoose.Schema.Types.Mixed,
  },
  actionUrl: String,
  notifyMethod: String, //currently not using
  actionType: String, //where it has to open
  actionId: String, // app end case mongo id
  chatBody: Object,
  type: String,
  userType: {
    type: String,
    default: "",
  },
  loginAlertCount: { type: Number, default: 0 },
  read: {
    type: Boolean,
    default: false,
  },
  visibleOnHome: {
    type: Boolean,
    default: false,
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

notificationSchema.index({ userId: 1, senderId: 1 });

module.exports = mongoose.model("Notification", notificationSchema);
