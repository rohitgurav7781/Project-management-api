var createError = require("http-errors");
var express = require("express");
var path = require("path");
var multer = require("multer");
var session = require("express-session");
const MongoStore = require("connect-mongo")(session);
var cors = require("cors");
var xss = require("xss-clean");
require("./cron/TimesheetCron");
var cookieParser = require("cookie-parser");
var bodyParser = require("body-parser");
// var compression = require('compression')

var admin = require("./routes/admin");
var user = require("./routes/user");

var index = require("./routes/index");
const AuthController = require("./api/controller/services/AuthorizationController");

var app = express();
// mongodb configuration
const mongoose = require("mongoose");
const connection = require("./config/connection");
// if there is not database then mongodb will not initialise. but if give db url then automatically create db instance
if (!(connection.dbUrl === undefined || connection.dbUrl.length <= 0)) {
  mongoose.set("debug", false);
  mongoose.Promise = require("bluebird");
  mongoose.Promise = global.Promise;
  mongoose.set("useFindAndModify", false);

  mongoose.connect(connection.dbUrl, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    //useFindAndModify: false, // ✅ Add this line
  });
  let db = mongoose.connection;
  db.once("open", function () {
    console.log("Db connnected");
  });
  db.on("error", function (err) {
    console.error(err);
  });
}

var corsOptions = {
  origin: ["http://localhost:3000", "http://13.201.20.98"],
  credentials: true,
};

app.use(cors(corsOptions));

app.use(
  express.json({
    limit: "50mb",
  }),
);
app.use(
  express.urlencoded({
    extended: true,
  }),
);
app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
  }),
);
app.use(xss());
// app.use(compression());
app.use(
  session({
    secret: "usica",
    resave: false, //don't save session if unmodified
    saveUninitialized: true,
    store: new MongoStore({
      mongooseConnection: mongoose.connection,
      //touchAfter: 24 * 3600, // time period in seconds
      ttl: 30 * 24 * 60 * 60, // = 14 days. Default
      autoRemove: "native", // Default
    }),
    rolling: true,
    cookie: {
      originalMaxAge: 30 * 24 * 60 * 60 * 1000,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      secure: false,
      // expires: new Date(Date.now() + 300000),
    },
  }),
);
app.use(cookieParser());

//user web build served here
app.use(express.static(path.join(__dirname, "dist")));
app.use("/", express.static(path.join(__dirname, "dist")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
// app.use(express.static(path.join(__dirname, "public")));
app.use(
  "/file/auth",
  function (req, res, next) {
    AuthController.checkStaticFileAuth(req, res, next);
    //next();
  },
  express.static("/home/ec2-user/usica_server/uploads"),
);
app.get("/home/ec2-user/usica_server/public/uploads/uploads/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join("/home/ec2-user/usica_server/public/uploads/uploads", filename);
  res.download(filePath, filename, err => {
    if (err) {
      console.error(`Error serving file: ${err.message}`);
      res.status(404).send({
        title: "File Not Found",
        message: "The requested file could not be found.",
      });
    }
  });
});

app.use("/file/unauth", express.static("/home/ec2-user/usica_server/uploads"));
app.use("/file/logs", express.static("/home/admin/.pm2/logs"));
app.use("/", express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/public", express.static(path.join(__dirname, "public")));
app.use("/public/uploads", express.static(path.join(__dirname, "public", "uploads")));
app.use("/app", express.static(path.join(__dirname, "build")));
//admin build served here
app.use(express.static(path.join(__dirname, "build")));
app.use("/admin", express.static(path.join(__dirname, "build")));
app.use("/user", express.static(path.join(__dirname, "build")));

app.use(express.static(path.join(__dirname, "public")));

// authentication for each request
app.use("/api", function (req, res, next) {
  AuthController.checkRequestAuth(req, res, next);
});

app.use("/admin", admin);
// app.use("/custom", customer);
app.use("/user", user);
app.use("/api", index);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  var err = new Error("Not Found");
  err.status = 404;
  //next(err);
  // res.status(404).render('404', {
  //   title: 'Oops! Not found'
  // });
  res.status(404).send({
    title: "Oops! Not found",
  });
});
app.use(express.static(path.join(__dirname, "public")));

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  if (err.status === 500) {
    console.log(err.status);
    res.status(500).send({
      title: "Oops! Server internal error",
    });
  }
});

module.exports = app;
