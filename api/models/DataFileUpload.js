let mongoose = require("mongoose");

let fileuploadSchema = mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
    },
    active: {
      type: Boolean,
      default: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    status: {
      type: String, // this will be inprocess,processed,error
      default: "",
    },
    trackId: {
      // this is the unique id which will generate aftere uploading records
      type: String,
      default: "",
    },
    menuName: {
      // upload is done from this menu and for this page maintainance , this can be use for filter condition
      type: String,
      default: "",
    },
    operationType: {
      // this will be used for the switch case, so that we can do particular process logic
      type: String,
      default: "",
    },
    collectionName: {
      // this is collection for which data is uploaded
      type: String,
      default: "",
    },
    message: {
      type: String,
      default: "",
    },
    fileName: {
      type: String,
      default: "",
    },
    uploadedFilePath: {
      type: String,
      default: "",
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    operatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    processedFilePath: {
      type: String,
      default: "",
    },
    successCount:{
      type: Number,
      default: 0,
    },
    errorCount:{
      type: Number,
      default: 0,
    },
    totalCount:{
      type: Number,
      default: 0,
    },
    errorFilePath: {
      type: String,
      default: "",
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
    collection: "datafileuploads",
  },
);
module.exports = mongoose.model("DataFileUpload", fileuploadSchema);
