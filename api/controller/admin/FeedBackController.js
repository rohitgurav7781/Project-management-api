const Feedback = require("../../models/FeedBack"); // Ensure the correct model name is used
const User = require("../../models/User");
const Organizations = require("../../models/Organizations"); // Correct import for Organizations
const Notification = require("../../models/Notification"); // Correct import for Organizations
const UtilController = require("../services/UtilController");
const returnCode = require("../../../config/responseCode").returnCode;
const mongoose = require("mongoose");
const FeedBack = require("../../models/FeedBack");

module.exports = {
  submitRatingFeedback: async (req, res, next) => {
    try {
      const { employeeId, managerId, organizationId, ratings } = req.body;

      // Use organizationId from session if not provided in request body
      const effectiveOrganizationId = organizationId || req.session.organizationId;

      const requiredFields = ["employeeId", "managerId", "ratings"];
      if (!effectiveOrganizationId) {
        requiredFields.push("organizationId");
      }
      const validationErrors = UtilController.validateRequiredFields(req.body, requiredFields);

      if (validationErrors.length > 0) {
        return UtilController.sendError(req, res, next, {
          message: "Validation errors occurred.",
          errors: validationErrors,
        });
      }

      // Validate existence of employee, manager, and organization
      const employee = await User.findById(employeeId);
      const manager = await User.findById(managerId);
      const organization = await Organizations.findById(effectiveOrganizationId);

      if (!employee || !manager || !organization) {
        return UtilController.sendError(req, res, next, {
          message: "Employee, Manager, or Organization not found",
          responseCode: returnCode.notFound,
        });
      }

      // Create and save the new rating feedback document
      const feedback = new Feedback({
        employeeId,
        managerId,
        organizationId: effectiveOrganizationId,
        feedbackType: "rating",
        ratings,
      });

      await feedback.save();

      //below notifictaion for orgaization admin
      let employeeDetails = await FeedBack.findById(feedback?._id).populate("employeeId");
      await Notification.create({
        userType: "organizationAdmin",
        recordId: feedback?._id,
        userId: req.session.organizationId,
        organizationId: employeeDetails?.organizationId,
        title: `New Rating Sent`,
        body: `You have sent a Rating to ${employeeDetails?.employeeId?.fname} ${employeeDetails?.employeeId?.lname}. Click to view details.`,
        type: "system",
        read: false,
        visibleOnHome: true,
        actionUrl: `/feedback/rating?id=${feedback._id}`,
      });
      //for manager
      await Notification.create({
        userType: "manager",
        recordId: feedback?._id,
        userId: feedback?.managerId,
        title: `New Rating Sent`,
        body: `You have sent a Rating to ${employeeDetails?.employeeId?.fname} ${employeeDetails?.employeeId?.lname}. Click to view details.`,
        type: "system",
        read: false,
        visibleOnHome: true,
        actionUrl: `/feedback/rating?id=${feedback._id}`,
      });
      //for employee
      await Notification.create({
        userType: "employee",
        recordId: feedback?._id,
        userId: feedback?.employeeId,
        title: `You’ve Received a Rating`,
        body: `You’ve received a Rating from [Manager/Team]. Check your profile to view the feedback.`,
        type: "system",
        read: false,
        visibleOnHome: true,
        actionUrl: `/feedback/rating?id=${feedback._id}`,
      });

      UtilController.sendSuccess(req, res, next, {
        message: "Rating feedback submitted successfully",
        feedback: {
          ...feedback.toObject(),
          managerName: `${manager.fname} ${manager.lname}`,
          managerDetails: {
            fname: manager.fname,
            lname: manager.lname,
            email: manager.email,
            position: manager.position,
          },
        },
      });
    } catch (error) {
      console.error("Error submitting rating feedback:", error);
      UtilController.sendError(req, res, next, {
        message: "Error submitting rating feedback",
        error: error.message,
      });
    }
  },

  submitAppreciationFeedback: async (req, res, next) => {
    try {
      const { employeeId, managerId, organizationId, title, description, attachments, specialNote } = req.body;

      // Use organizationId from session if not provided in request body
      const effectiveOrganizationId = organizationId || req.session.organizationId;

      const requiredFields = ["employeeId", "managerId", "title"];
      if (!effectiveOrganizationId) {
        requiredFields.push("organizationId");
      }
      const validationErrors = UtilController.validateRequiredFields(req.body, requiredFields);

      if (validationErrors.length > 0) {
        return UtilController.sendError(req, res, next, {
          message: "Validation errors occurred.",
          errors: validationErrors,
        });
      }

      // Validate existence of employee, manager, and organization
      const employee = await User.findById(employeeId);
      const manager = await User.findById(managerId);
      const organization = await Organizations.findById(effectiveOrganizationId);

      if (!employee || !manager || !organization) {
        return UtilController.sendError(req, res, next, {
          message: "Employee, Manager, or Organization not found",
          responseCode: returnCode.notFound,
        });
      }

      // Create and save the new appreciation feedback document
      const feedback = new Feedback({
        employeeId,
        managerId,
        organizationId: effectiveOrganizationId,
        feedbackType: "appreciation",
        title,
        description,
        attachments,
        specialNote,
      });

      await feedback.save();

      let employeeDetails = await FeedBack.findById(feedback?._id).populate("employeeId");
      await Notification.create({
        userType: "organizationAdmin",
        recordId: feedback?._id,
        userId: req.session.organizationId,
        organizationId: employeeDetails?.organizationId,
        title: `New Appreciation Sent`,
        body: `You have sent a Appreciation to ${employeeDetails?.employeeId?.fname} ${employeeDetails?.employeeId?.lname}. Click to view details.`,
        type: "system",
        read: false,
        visibleOnHome: true,
        actionUrl: `/feedback/appreciation?id=${feedback._id}`,
      });
      //for manager
      await Notification.create({
        userType: "manager",
        recordId: feedback?._id,
        userId: feedback?.managerId,
        title: `New Appreciation Sent`,
        body: `You have sent a Appreciation to ${employeeDetails?.employeeId?.fname} ${employeeDetails?.employeeId?.lname}. Click to view details.`,
        type: "system",
        read: false,
        visibleOnHome: true,
        actionUrl: `/feedback/appreciation?id=${feedback._id}`,
      });
      //for employee
      await Notification.create({
        userType: "employee",
        recordId: feedback?._id,
        userId: feedback?.employeeId,
        title: `You’ve Received a Appreciation`,
        body: `You’ve received a Appreciation from [Manager/Team]. Check your profile to view the feedback.`,
        type: "system",
        read: false,
        visibleOnHome: true,
        actionUrl: `/feedback/appreciation?id=${feedback._id}`,
      });
      UtilController.sendSuccess(req, res, next, {
        message: "Appreciation feedback submitted successfully",
        feedback,
      });
    } catch (error) {
      console.error("Error submitting appreciation feedback:", error);
      UtilController.sendError(req, res, next, {
        message: "Error submitting appreciation feedback",
        error: error.message,
      });
    }
  },

  updateFeedback: async (req, res, next) => {
    try {
      const { recordId } = req.body;

      if (!recordId) {
        return UtilController.sendError(req, res, next, {
          message: "Record ID is required",
        });
      }

      const updateFields = { ...req.body };
      delete updateFields.id; // Remove id from the updateFields

      // console.log("Updating Feedback ID:", recordId);
      // console.log("Update Fields:", updateFields);

      updateFields["updatedAt"] = Math.floor(new Date() / 1000);

      // Ensure feedback exists and is not soft deleted
      const updatedFeedback = await Feedback.findOneAndUpdate(
        { _id: recordId, active: true },
        { $set: updateFields },
        { new: true, runValidators: true },
      );

      if (!updatedFeedback) {
        UtilController.sendError(req, res, next, {
          message: "Feedback not found or already deleted",
        });
      }

      UtilController.sendSuccess(req, res, next, {
        message: "Feedback updated successfully",
        feedback: updatedFeedback,
      });
    } catch (error) {
      console.error("Error updating feedback:", error);
      UtilController.sendError(req, res, next, {
        message: "Error updating feedback",
        error: error.message,
      });
    }
  },
  softDeleteFeedback: async (req, res, next) => {
    try {
      const { recordIds } = req.body; // Expecting an array of feedback IDs

      if (!Array.isArray(recordIds) || recordIds.length === 0) {
        return UtilController.sendError(req, res, next, {
          message: "Feedback IDs are required for soft deletion",
        });
      }

      // Proceed with soft deletion
      const result = await Feedback.updateMany(
        { _id: { $in: recordIds }, active: true }, // Find active feedbacks with IDs in the array
        { active: false }, // Set 'active' to false for soft deletion
      );

      if (result.matchedCount === 0) {
        UtilController.sendError(req, res, next, {
          message: "No feedback found or already soft deleted",
        });
      }

      UtilController.sendSuccess(req, res, next, {
        message: "Feedbacks marked as inactive (soft deleted) successfully.",
        code: returnCode.success, // Success code
        responseCode: returnCode.validSession,
      });
    } catch (error) {
      console.error(error);
      UtilController.sendError(req, res, next, error.message);
    }
  },

  queryFeedback: async (req, res, next) => {
    try {
      const { keyword, organizationId, filter } = req.body;

      // Initialize match stage for filtering
      let matchStage = { active: true }; // Ensure only non-deleted feedback is fetched

      let sortOrder = {};
      const startDate = req.body.startDate;
      const endDate = req.body.endDate;

      if (!UtilController.isEmpty(req.body.active)) matchStage["active"] = req.body.active;
      // Determine sorting order
      if (!UtilController.isEmpty(req.body.sortOrder) && !UtilController.isEmpty(req.body.sortField)) {
        sortOrder[req.body.sortField] = req.body.sortOrder === "false" ? -1 : 1;
      } else {
        sortOrder = { updatedAt: -1 }; // Default sorting order
      }

      // Pagination setup
      const page = Number(req.body.page) || 0; // Default to 0 for the first page
      const pageSize = Number(req.body.pageSize) || 10; // Default page size

      // Organization filter - check session if organizationId is not in request body
      const effectiveOrganizationId = organizationId || req.session.organizationId;
      if (effectiveOrganizationId) {
        matchStage.organizationId = mongoose.Types.ObjectId(effectiveOrganizationId);
      }

      // Feedback type filter
      if (filter) {
        matchStage.feedbackType = filter; // Add filter for feedbackType
      }

      if (req.body.state) {
        initialMatchStage.state = { $regex: new RegExp(req.body.state, "i") };
      }

      if (req.body.country) {
        initialMatchStage.country = { $regex: new RegExp(req.body.country, "i") };
      }

      // Date range filter
      if (!UtilController.isEmpty(req.body.startDate) || !UtilController.isEmpty(req.body.endDate)) {
        matchStage["$and"] = [];
        if (!UtilController.isEmpty(req.body.startDate)) {
          matchStage["$and"].push({ createdAt: { $gte: req.body.startDate } });
        }
        if (!UtilController.isEmpty(req.body.endDate)) {
          matchStage["$and"].push({ createdAt: { $lte: req.body.endDate } });
        }
      }
      if (req.session?.userType == "Manager") matchStage["managerId"] = mongoose.Types.ObjectId(req.session.userId);
      else if (req.session?.userType == "Employee")
        matchStage["employeeId"] = mongoose.Types.ObjectId(req.session.userId);

      const search = {};
      if (!UtilController.isEmpty(keyword)) {
        search["$or"] = [
          { "organizationDetails.organizationName": { $regex: new RegExp(keyword, "i") } },
          { employeeName: { $regex: new RegExp(keyword, "i") } },
          { managerName: { $regex: new RegExp(keyword, "i") } },
          { title: { $regex: new RegExp(keyword, "i") } },
        ];
      }

      // Common pipeline for fetching feedback data with organization and user details
      const pipeline = [
        { $match: matchStage }, // Apply filtering (organization, feedbackType, active status)
        {
          $lookup: {
            from: "users", // Join with users for employee details
            localField: "employeeId",
            foreignField: "_id",
            as: "employeeDetails",
          },
        },
        { $unwind: { path: "$employeeDetails", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "users", // Join with users for manager details
            localField: "managerId",
            foreignField: "_id",
            as: "managerDetails",
          },
        },
        { $unwind: { path: "$managerDetails", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "organizations", // Join with organizations for organization details
            localField: "organizationId",
            foreignField: "_id",
            as: "organizationDetails",
          },
        },
        { $unwind: { path: "$organizationDetails", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            title: 1,
            ratings: 1,
            averageRating: 1,
            description: 1,
            specialNote: 1,
            date: 1,
            createdAt: 1,
            updatedAt: 1,
            employeeName: {
              $concat: [
                { $ifNull: ["$employeeDetails.fname", ""] }, // Handle null values for fname
                " ", // Add a space between fname and lname
                { $ifNull: ["$employeeDetails.lname", ""] }, // Handle null values for lname
              ],
            },
            managerName: {
              $concat: [
                { $ifNull: ["$managerDetails.fname", ""] }, // Handle null values for fname
                " ", // Add a space between fname and lname
                { $ifNull: ["$managerDetails.lname", ""] }, // Handle null values for lname
              ],
            },
            organizationName: "$organizationDetails.organizationName",
          },
        },
        // Search filter
        { $match: search }, // Final match stage for search
        { $sort: sortOrder },
        { $skip: page * pageSize }, // Skip based on current page
        { $limit: pageSize }, // Limit results
      ];

      // Execute the aggregation pipeline
      const feedbacks = await Feedback.aggregate(pipeline);

      // Count total number of documents that match the initial match stage (for pagination)
      const totalCount = await Feedback.countDocuments(matchStage);

      // Response
      UtilController.sendSuccess(req, res, next, {
        rows: feedbacks,
        responseCode: returnCode.validSession,
        pages: Math.ceil(totalCount / pageSize), // Total pages available
        filterRecords: totalCount, // Total number of filtered records
      });
    } catch (err) {
      console.error("Error fetching feedbacks:", err);
      UtilController.sendError(req, res, next, err);
    }
  },

  getFeedbackById: async (req, res, next) => {
    try {
      const { recordId } = req.body; // Extract feedback ID from request body

      // Validate the provided ObjectId
      if (!mongoose.Types.ObjectId.isValid(recordId)) {
        UtilController.sendError(req, res, next, "Invalid feedback ID.");
      }

      // Define the match stage to find the feedback by ID and ensure it is not deleted
      const matchStage = { _id: mongoose.Types.ObjectId(recordId), active: true };

      // Define the aggregation pipeline to fetch feedback along with user and organization details
      const pipeline = [
        { $match: matchStage }, // Match feedback by ID
        {
          $lookup: {
            from: "users", // Lookup employee details from users collection
            localField: "employeeId",
            foreignField: "_id",
            as: "employeeDetails",
          },
        },
        { $unwind: { path: "$employeeDetails", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "users", // Lookup manager details from users collection
            localField: "managerId",
            foreignField: "_id",
            as: "managerDetails",
          },
        },
        { $unwind: { path: "$managerDetails", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "organizations", // Lookup organization details from organizations collection
            localField: "organizationId",
            foreignField: "_id",
            as: "organizationDetails",
          },
        },
        { $unwind: { path: "$organizationDetails", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            title: 1, // Assuming feedback has a title field (if present)
            ratings: 1, // Include the entire ratings object
            averageRating: 1,
            description: 1, // Assuming there's a description (if present)
            attachments: 1,
            specialNote: 1,
            date: 1,
            feedbackType: 1, // Include feedbackType (like 'rating', 'appreciation', etc.)
            employee: {
              fname: "$employeeDetails.fname",
              lname: "$employeeDetails.lname",
              email: "$employeeDetails.email",
              _id: "$employeeDetails._id",
            },
            manager: {
              fname: "$managerDetails.fname",
              lname: "$managerDetails.lname",
              email: "$managerDetails.email",
              _id: "$managerDetails._id",
            },
            organization: {
              name: "$organizationDetails.organizationName",
              _id: "$organizationDetails._id",
            },
          },
        },
      ];

      // Execute the aggregation pipeline to fetch feedback
      const feedback = await Feedback.aggregate(pipeline);

      // If feedback is not found, return an error
      if (!feedback || feedback.length === 0) {
        UtilController.sendError(req, res, next, "Feedback not found.");
      }

      // Return the feedback details as the first (and only) item in the array
      UtilController.sendSuccess(req, res, next, {
        results: feedback[0], // Return the feedback document
        responseCode: returnCode.validSession,
      });
    } catch (err) {
      console.error("Error fetching feedback by ID:", err);
      UtilController.sendError(req, res, next, err);
    }
  },
};
