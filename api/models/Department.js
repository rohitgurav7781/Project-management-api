const mongoose = require("mongoose");

const departmentSchema = new mongoose.Schema({
  active: {
    type: Boolean,
    default: true,
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
  },
  departmentId: {
    type: String,
    required: true,
  },
  logo: {
    type: String,
  },
  name: {
    type: String,
    required: true,
  },
  head: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  description: {
    type: String,
  },
  location: {
    type: String,
  },
  phone: {
    type: String,
  },
  isParent: {
    type: Boolean,
    required: true,
    default: true,
  },
  parentDepartment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Department",
    required: function () {
      return !this.isParent;
    },
  },
  attachment:[],
  note:{
    type:String
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
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

//create index
departmentSchema.index({ organizationId: 1, departmentId: 1 });

module.exports = mongoose.model("Department", departmentSchema);
