let mongoose = require('mongoose');

let tagSchema = mongoose.Schema({
    // areaId: {
    //   type: mongoose.Schema.Types.ObjectId,
    //   ref: 'Area'
    // },

    tagType: { // like generic,prescription,otc
      type: String,
      default: "otc"
    },
    prefix: {
      type: String,
      default:'otc-'
    },
    sequenceNo: { // this is the continuous number to track and needs to do auto increment
      type: Number
    },
    active: {
      type: Boolean,
      default: true
    },
    createdAt: {
      type: Number,
      default: Math.floor(Date.now() / 1000)
    },
    updatedAt: {
      type: Number,
      default: Math.floor(Date.now() / 1000)
    }

  },
  /*{
  // this block will use when do we need to specify collection name. collection name should be case sensitive
  otherwise model plural name consider as collection name
    collection: 'workCenters'
  }*/
);
module.exports = mongoose.model('Tag', tagSchema);
