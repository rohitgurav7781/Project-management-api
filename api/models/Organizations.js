const mongoose = require("mongoose");
const noSpacesValidator = {
  validator: function (v) {
    return !/\s/.test(v);
  },
  message: props => `${props.value} cannot contain space`,
};

const emailValidator = {
  validator: function (v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  },
  message: props => `${props.value} is not a valid email address`,
};
const organizationSchema = mongoose.Schema(
  {
    active: {
      type: Boolean,
      default: true,
      validate: noSpacesValidator,
    },
    organizationTagId: {
      type: String,
      required: true,
      unique: true,
      validate: noSpacesValidator,
    },
    organizationName: {
      type: String,
      required: true,
    },
    employeePrefix: {
      type: String,
      required: true,
    },
    employeeSequenceNo: {
      type: Number,
      default: 0,
    },
    branchName: {
      type: String,
    },
    profileImage: {
      type: String,
      default: "",
    },
    organizationAddress: {
      type: String,
      required: true,
    },
    city: {
      type: String,
      required: true,
    },
    state: {
      type: String,
      required: true,
    },
    country: {
      type: String,
      required: true,
    },
    postalCode: {
      type: String,
      required: true,
    },
    registrationNumber: {
      type: String,
      required: true,
      unique: true,
      validate: noSpacesValidator,
    },
    prefix: {
      type: String,
      default: "", //this is we are defining a prefix while creating the organization
    },
    organizationEmail: {
      type: String,
      required: true,
      validate: [emailValidator, noSpacesValidator],
    },
    organizationPhone: {
      type: String,
      required: true,
      validate: noSpacesValidator,
    },
    primaryContactPerson: {
      type: String,
    },
    primaryContactEmail: {
      type: String,
      validate: {
        validator: function (v) {
          // Validate only if `primaryContactEmail` is present
          return !v || (emailValidator.validator(v) && noSpacesValidator.validator(v));
        },
      },
    },
    primaryContactPhone: {
      type: String,
      validate: noSpacesValidator,
    },
    createdAt: {
      type: Number,
      default: Math.floor(Date.now() / 1000),
    },
    updatedAt: {
      type: Number,
      default: Math.floor(Date.now() / 1000),
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    operatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    collection: "organizations",
  },
);

module.exports = mongoose.model("Organization", organizationSchema);
