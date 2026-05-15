const mongoose = require("mongoose");

const emailTemplateSchema = new mongoose.Schema({
  active: {
    type: Boolean,
    default: true,
  },
  templateId: {
    type: String,
    default: "",
  },
  emailTitle: {
    type: String,
    default: "",
  },
  subject: {
    type: String,
    default: "",
  },
  emailDescription: {
    type: String,
    default: "",
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
  },
  emailAttachments: [],
  //   emailSendTo: [
  //     {
  //       type: mongoose.Schema.Types.ObjectId,
  //       ref: "User",
  //     },
  //   ],
  //   emailSendBy: {
  //     type: mongoose.Schema.Types.ObjectId,
  //     ref: "User",
  //   },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
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

emailTemplateSchema.index({
  templateId: 1,
  createdAt: -1,
});

module.exports = mongoose.model("EmailTemplate", emailTemplateSchema);
