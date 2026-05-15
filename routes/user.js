var express = require("express");
var router = express.Router();
var cron = require("node-cron");

router.use(function (req, res, next) {
    //  console.log('Something is happening. in admin route');
    next();
  });

  // customer


  module.exports = router;