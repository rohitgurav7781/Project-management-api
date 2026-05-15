let mongoose = require("mongoose");

let paymentReportSchema = mongoose.Schema(
  {
    paymentInitiated: Object, //capturing at the time of generating access code for easebuzz ie /initiate/pay
    paymentResponse: Object, //payment response body
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    txnid: {
      //transaction id
      type: String,
      default: "",
    },
    name: {
      type: String,
      default: "",
    },
    email: {
      type: String,
      default: "",
    },
    mobileNo: {
      type: String,
      default: "",
    },
    paymentDone: {
      type: Boolean,
    },
    createdAt: {
      type: Number,
      default: Math.floor(Date.now() / 1000),
    },
  },
  {
    collection: "paymentReports",
  }
);
module.exports = mongoose.model("PaymentReport", paymentReportSchema);
