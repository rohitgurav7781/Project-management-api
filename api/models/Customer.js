let mongoose = require("mongoose");
const noSpacesValidator = {
  validator: function (v) {
    return !/\s/.test(v);
  },
  message: props => `${props.value} cannot contain space`,
};

let customerSchema = mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
    },
    customerName: {
      type: String,
    },
    customerId: {
      type: String,
    },
    customerTagId: {
      type: String,
      required: true,
      unique: true,
      validate: noSpacesValidator,
    },
    companyName: {
      type: String,
      required: true,
    },
    email: String,
    mobileNo: Number,
    active: {
      type: Boolean,
      default: true,
      validate: noSpacesValidator,
    },
    city: String,
    address: String,
    country: String,
    countryCode: String,
    state: String,
    region: String,
    postalCode: String,
    contactPerson: [
      {
        personName: String,
        email: String,
        phoneNo: String,
        countryCode: String,
        jobTitle: String,
      },
    ],
    attachment:[],
    note:{
      type:String
    },
    logo: String,
    createdType: String, // this value will tell us is it created by manually or by bulk upload
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    operatedBy: {
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
  },
  {
    // this block will use when do we need to specify collection name. collection name should be case sensitive
    //otherwise model plural name consider as collection name
    collection: "customers",
  },
);
module.exports = mongoose.model("Customer", customerSchema);
