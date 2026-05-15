const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema({
  // Employee receiving the feedback
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  // Organization related to the feedback
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
  },

  // Manager providing the feedback
  managerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  // Title of the feedback
  title: {
    type: String,
  },

  // Date of feedback submission
  date: {
    type: Number,
    default: () => Math.floor(Date.now() / 1000),
  },

  // Ratings for different criteria (optional for appreciation feedback)
  ratings: {
    efficiency: { type: Number, min: 1, max: 100 },
    qualityOfWork: { type: Number, min: 1, max: 100 },
    teamPlayer: { type: Number, min: 1, max: 100 },
    punctuality: { type: Number, min: 1, max: 100 },
    trainingAndDevelopment: { type: Number, min: 1, max: 100 },
  },

  // Average rating calculation (will be calculated only if ratings are provided)
  averageRating: {
    type: Number,
  },

  // Feedback description (optional for rating feedback)
  description: {
    type: String,
  },

  // Attachments like certificates or screenshots (optional for rating feedback)
  attachments: [
    {
      type: String, // This could be file paths or URLs to attached documents
    },
  ],

  // Special note field (optional for both)
  specialNote: {
    type: String,
    default: "",
  },
  feedbackType: {
    type: String,
    enum: ["rating", "appreciation"], // Limit values to rating and appreciation
    required: true,
  },

  // deleted: { type: Boolean, default: false },
  active: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Number,
    default: () => Math.floor(Date.now() / 1000),
  },
  updatedAt: {
    type: Number,
    default: () => Math.floor(Date.now() / 1000),
  },
});

// Middleware to calculate average rating before saving (only for rating feedback)
feedbackSchema.pre("save", function (next) {
  if (this.ratings) {
    const ratings = this.ratings;
    this.averageRating =
      (ratings.efficiency +
        ratings.qualityOfWork +
        ratings.teamPlayer +
        ratings.punctuality +
        ratings.trainingAndDevelopment) /
      5;
  }
  next();
});
feedbackSchema.index({ employeeId: 1, active: 1, feedbackType: 1,date: 1 });
module.exports = mongoose.model("Feedback", feedbackSchema);
