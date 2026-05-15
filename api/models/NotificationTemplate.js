let mongoose = require("mongoose");

let templateSchema = mongoose.Schema(
  {
    // areaId: {
    //   type: mongoose.Schema.Types.ObjectId,
    //   ref: 'Area'
    // },
    title: {
      // this is to fetch template for predefined operation, and keep this value in all areaIds
      type: String,
      default: "",
    },
    active: {
      type: Boolean,
      default: true,
    },
    publish: {
      type: Boolean,
      default: true,
    },
    isTemplate: {
      // if this value is true then we should not delete these template, because it will used in some place.these are fixed for defined operation
      type: Boolean,
      default: false,
    },
    notificationType: {
      type: String,
      default: "", // this can be sms,email,notice,inapp,broadcast
    },
    templateId: {
      // this is to read a email or sms template from sendgrid or other service provider
      type: String,
      default: "",
    },
    content: {
      // message body
      type: String,
      default: "",
    },
    subject: {
      // subject
      type: String,
      default: "",
    },
    dynamicVariable: [
      {
        label: {
          type: String,
          default: "",
        },
        dataType: {
          type: String,
          default: "text", // this can be number, date,
        },
        contentLength: {
          type: Number,
          default: 10,
        },
      },
    ],
    operatedBy: {
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
  },
  {
    // this block will use when do we need to specify collection name. collection name should be case sensitive
    //otherwise model plural name consider as collection name
    collection: "notification_templates",
  }
);
module.exports = mongoose.model("NotificationTemplate", templateSchema);
