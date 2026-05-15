module.exports = {
  login: {
    otpValidation: 300, // 5 minutes
    "2FactorAuthentication": true,
    maxBadPasswordAttempt: 3,
  },
  cancellationFee: 60, // In rupees
  maxDistance: 5000, // In metres
};
