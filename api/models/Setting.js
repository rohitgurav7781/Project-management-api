let mongoose = require('mongoose');

let settingSchema = mongoose.Schema({
  version: [{
    name: {
      type: String
    },
    active: {
      type: Boolean,
      default: true
    },
    forceUpdate: { // this is for the app force update, means when we release new version very body has to install or update new version else app will not work.
      type: Boolean,
      default: false
    },
    version: {
      type: String
    },
    createdAt: {
      type: Number
    }
  }],
  centerRadius: {
    type: Number
  }




},
  /*{
  // this block will use when do we need to specify collection name. collection name should be case sensitive
  otherwise model plural name consider as collection name
    collection: 'workCenters'
  }*/
);
module.exports = mongoose.model('Setting', settingSchema);
