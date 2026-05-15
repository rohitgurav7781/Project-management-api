const passwordSecretKey = "Admin@2O$0";
const jwt = require("jsonwebtoken");

module.exports = {
  verifyToken: (token) => {
    try {
      var decoded = jwt.verify(token, passwordSecretKey);
      return decoded;
    } catch (err) {
      console.error("error in verify token--", err.name, err.message);
      return err;
    }
  },
  createToken: (uid, expiresIn = 604800) => {
    try {
      var token = jwt.sign({ uid }, passwordSecretKey, {
        expiresIn: expiresIn, //sec
      });
      return token;
    } catch (error) {
      console.error("error in create token----", error);
      return error;
    }
  },
  addUserToReq(req, userObj) {
    try {
      req.user = { ...req?.user, ...userObj };
      return req;
    } catch (error) {
      console.error("error adduserTkn-", error);
      return error;
    }
  },
};
