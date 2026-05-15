let mongoose = require('mongoose');

let slotSchema = mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Doctor",
  },
  // 7 operationSlots max is 7
  // 0 = sunday 1 2 3 4 5 6
  operationSlots: [
    {
      // timeslots
      day: String,
      category:{
        type:String,
        default:'bookAppointment' // video consultation(videoConsultation) book appointment
      },
      // consultation type like regular booking and video consultation
      shift:{
        type:String //this is work shift, like morning,afternoon,evening,night
      },
      availableIn:{ // this doctor location, where they will be available to consult
        type: mongoose.Schema.Types.ObjectId,
        ref: "Clinic", // this is to take a decision on who can see this slot details and booking
      }, //means  here to get address of that doctor or clinic or hospital
       timeslots: [
        {
          slotNo: {
            type: Number, // this is to keep track of each request and count
            default: 0,
          },
          slot: {
            type: String, // only to print or display the data, it will be in HH:mm:ss 09:30 am
          },
        },
      ],
      isHoliday: {
        type: Boolean,
        default: false,
      },
    },
  ]

}, {
  // this block will use when do we need to specify collection name. collection name should be case sensitive
  //otherwise model plural name consider as collection name
  collection: 'slots'
});
module.exports = mongoose.model('Slot', slotSchema);
