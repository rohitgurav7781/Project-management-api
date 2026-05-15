let mongoose = require('mongoose');

let versionSchema = mongoose.Schema({
  recordId:String,// this is the mongoId of particular record, it can be from any documents(table)
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  data: Object,
  updatedAt: {
    type: Number,
    default: () => Math.floor(Date.now() / 1000)
  },
},
  {
    // this block will use when do we need to specify collection name. collection name should be case sensitive
    //otherwise model plural name consider as collection name
    collection: 'versiontrack'
  });
  module.exports = mongoose.model('VersionTrack', versionSchema);
