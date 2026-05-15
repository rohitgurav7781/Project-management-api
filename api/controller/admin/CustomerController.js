let request = require("request");
const Customer = require("../../models/Customer");
const User = require("../../models/User");
const Tag = require("../../models/Tag");
const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;
const { parsePhoneNumberFromString } = require("libphonenumber-js");
const UtilController = require("../services/UtilController");
const UploadController = require("../services/UploadController");
const returnCode = require("../../../config/responseCode").returnCode;
const DataFileUpload = require("../../models/DataFileUpload");
const UploadedDatafileProcessing = require("../services/UploadedDatafileProcessing");
const NotificationController = require("../services/NotificationController");
const Notification = require("../../models/Notification");
const Organizations = require("../../models/Organizations");

module.exports = {
  queryAllCustomer: async (req, res, next) => {
    try {
      const sortOrder = {};
      const {
        startDate,
        endDate,
        sortOrder: reqSortOrder,
        sortField,
        keyword = "",
        page = 0,
        pageSize = 10,
        active,
        organizationId,
        createdBy,
      } = req.body;

      // Determine sorting order
      if (reqSortOrder && sortField) {
        sortOrder[sortField] = reqSortOrder === "false" ? -1 : 1;
      } else {
        sortOrder.updatedAt = -1; // Default sort by updated date
      }

      // Initial match stage for filtering customers
      const initialMatchStage = {};

      // Filtering by active status
      if (active !== undefined && active !== "all") {
        initialMatchStage.active = active;
      }
      if (endDate) {
        const matchConditions = [];
        if (startDate) matchConditions.push({ createdAt: { $gte: parseInt(startDate) } });
        matchConditions.push({ createdAt: { $lte: parseInt(endDate) } });
        initialMatchStage["$and"] = matchConditions;
      }

      // Retrieve organizationId from session if not provided in request body
      const effectiveOrganizationId = organizationId || req.session.organizationId;
      if (effectiveOrganizationId) {
        initialMatchStage.organizationId = mongoose.Types.ObjectId(effectiveOrganizationId);
      }

      if (createdBy) {
        initialMatchStage.createdBy = mongoose.Types.ObjectId(createdBy);
      }

      if (!UtilController.isEmpty(req.body.state)) {
        const normalizedState = req.body.state.replace(/\s+/g, "");
        initialMatchStage["state"] = {
          $regex: normalizedState.split("").join("\\s*"),
          $options: "i",
        };
      }

      if (req.body.country) {
        initialMatchStage.country = { $regex: req.body.country, $options: "i" };
      }

      // Search object
      const search = {};
      if (!UtilController.isEmpty(keyword)) {
        const keywordRegex = new RegExp(keyword, "i");

        search["$or"] = [
          { customerName: { $regex: keywordRegex } },
          { email: { $regex: keywordRegex } },
          { companyName: { $regex: keywordRegex } },
          { customerTagId: { $regex: keywordRegex } },
          { country: { $regex: keywordRegex } },
          { state: { $regex: keywordRegex } },
          { "organization.organizationName": { $regex: keywordRegex } },
          { "contactPerson.personName": { $regex: keywordRegex } },
          { "contactPerson.phoneNo": { $regex: keywordRegex } },
          { "createdByUser.fname": { $regex: keywordRegex } },
          { "createdByUser.lname": { $regex: keywordRegex } },
          // Convert mobileNo to string and apply regex
          { $expr: { $regexMatch: { input: { $toString: "$mobileNo" }, regex: keywordRegex } } },
        ];
      }

      // Common pipeline for data fetching
      console.log(JSON.stringify(initialMatchStage));
      const commonPipeline = [
        { $match: initialMatchStage },
        {
          $lookup: {
            from: "organizations",
            localField: "organizationId",
            foreignField: "_id",
            as: "organization",
          },
        },
        { $unwind: { path: "$organization", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "users",
            localField: "createdBy",
            foreignField: "_id",
            as: "createdByUser",
          },
        },
        { $unwind: { path: "$createdByUser", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "users",
            localField: "operatedBy",
            foreignField: "_id",
            as: "operatedByUser",
          },
        },
        { $unwind: { path: "$operatedByUser", preserveNullAndEmptyArrays: true } },
        {
          $unwind: {
            path: "$contactPerson",
          },
        },
        { $match: search },
        {
          $group: {
            _id: "$_id",
            customerName: { $first: "$customerName" },
            companyName: { $first: "$companyName" },
            customerTagId: { $first: "$customerTagId" },
            email: { $first: "$email" },
            mobileNo: { $first: "$mobileNo" },
            city: { $first: "$city" },
            state: { $first: "$state" },
            country: { $first: "$country" },
            postalCode: { $first: "$postalCode" },
            attachment: { $first: "$attachment" },
            note: { $first: "$note" },
            contactPersons: { $push: "$contactPerson" },
            active: { $first: "$active" },
            createdAt: { $first: "$createdAt" },
            updatedAt: { $first: "$updatedAt" },
            organization: { $first: "$organization" },
            createdByUser: { $first: "$createdByUser" },
            operatedByUser: { $first: "$operatedByUser" },
          },
        },

        // Final match stage for search
        { $sort: sortOrder },
        { $skip: page * pageSize },
        { $limit: pageSize },
        {
          $project: {
            customerName: 1,
            companyName: 1,
            customerTagId: 1,
            email: 1,
            mobileNo: 1,
            city: 1,
            state: 1,
            country: 1,
            postalCode: 1,
            attachment: 1,
            note: 1,
            contactPersonNumber: {
              $reduce: {
                input: "$contactPersons.phoneNo",
                initialValue: "",
                in: {
                  $cond: [{ $eq: ["$$value", ""] }, "$$this", { $concat: ["$$value", ", ", "$$this"] }],
                },
              },
            },
            contactPersonName: {
              $reduce: {
                input: "$contactPersons.personName",
                initialValue: "",
                in: {
                  $cond: [{ $eq: ["$$value", ""] }, "$$this", { $concat: ["$$value", ", ", "$$this"] }],
                },
              },
            },
            active: 1,
            createdAt: 1,
            updatedAt: 1,
            organization: {
              organizationName: 1,
              _id: 1,
            },
            organizationName: "$organization.organizationName",
            createdByUser: {
              $concat: [{ $ifNull: ["$createdByUser.fname", ""] }, " ", { $ifNull: ["$createdByUser.lname", ""] }],
            },
            operatedByUser: {
              $concat: [{ $ifNull: ["$operatedByUser.fname", ""] }, " ", { $ifNull: ["$operatedByUser.lname", ""] }],
            },
            createdByUserProfileImage: "$createdByUser.profileImage",
            operatedByUserProfileImage: "$operatedByUser.profileImage",
          },
        },
      ];
      // Fetch results
      console.log(JSON.stringify(commonPipeline));

      const result = await Customer.aggregate(commonPipeline);
      // Count total documents matching the initial match stage
      const totalCount = await Customer.countDocuments(initialMatchStage);

      // Send success response
      UtilController.sendSuccess(req, res, next, {
        rows: result,
        responseCode: returnCode.validSession,
        pages: Math.ceil(totalCount / pageSize),
        filterRecords: totalCount,
      });
    } catch (err) {
      console.error(err);
      UtilController.sendError(req, res, next, err);
    }
  },

  allCustomer: async (req, res, next) => {
    try {
      let organizationId = req.session.organizationId;
      const sortOrder = {};
      sortOrder.updatedAt = -1; // Default sort by updated date

      // Initial match stage for filtering customers
      const initialMatchStage = {};

      // Filtering by active status
      initialMatchStage.active = true;

      if (!UtilController.isEmpty(organizationId)) {
        initialMatchStage["organizationId"] = mongoose.Types.ObjectId(organizationId);
      }

      const commonPipeline = [
        { $match: initialMatchStage },
        {
          $lookup: {
            from: "organizations",
            localField: "organizationId",
            foreignField: "_id",
            as: "organization",
          },
        },
        { $unwind: { path: "$organization", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "users",
            localField: "createdBy",
            foreignField: "_id",
            as: "createdByUser",
          },
        },
        { $unwind: { path: "$createdByUser", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "users",
            localField: "operatedBy",
            foreignField: "_id",
            as: "operatedByUser",
          },
        },
        { $unwind: { path: "$operatedByUser", preserveNullAndEmptyArrays: true } },
        {
          $unwind: {
            path: "$contactPerson",
          },
        },
        {
          $group: {
            _id: "$_id",
            customerName: { $first: "$customerName" },
            companyName: { $first: "$companyName" },
            customerTagId: { $first: "$customerTagId" },
            email: { $first: "$email" },
            mobileNo: { $first: "$mobileNo" },
            city: { $first: "$city" },
            state: { $first: "$state" },
            country: { $first: "$country" },
            postalCode: { $first: "$postalCode" },
            attachment: { $first: "$attachment" },
            note: { $first: "$note" },
            contactPersons: { $push: "$contactPerson" },
            active: { $first: "$active" },
            createdAt: { $first: "$createdAt" },
            updatedAt: { $first: "$updatedAt" },
            organization: { $first: "$organization" },
            createdByUser: { $first: "$createdByUser" },
            operatedByUser: { $first: "$operatedByUser" },
          },
        },

        // Final match stage for search
        { $sort: sortOrder },
        //{ $skip: page * pageSize },
        //{ $limit: pageSize },
        {
          $project: {
            customerName: 1,
            companyName: 1,
            customerTagId: 1,
            email: 1,
            mobileNo: 1,
            city: 1,
            state: 1,
            country: 1,
            postalCode: 1,
            attachment: 1,
            note: 1,
            contactPersonNumber: {
              $reduce: {
                input: "$contactPersons.phoneNo",
                initialValue: "",
                in: {
                  $cond: [{ $eq: ["$$value", ""] }, "$$this", { $concat: ["$$value", ", ", "$$this"] }],
                },
              },
            },
            contactPersonName: {
              $reduce: {
                input: "$contactPersons.personName",
                initialValue: "",
                in: {
                  $cond: [{ $eq: ["$$value", ""] }, "$$this", { $concat: ["$$value", ", ", "$$this"] }],
                },
              },
            },
            active: 1,
            createdAt: 1,
            updatedAt: 1,
            organization: {
              organizationName: 1,
              _id: 1,
            },
            organizationName: "$organization.organizationName",
            createdByUser: {
              $concat: [{ $ifNull: ["$createdByUser.fname", ""] }, " ", { $ifNull: ["$createdByUser.lname", ""] }],
            },
            operatedByUser: {
              $concat: [{ $ifNull: ["$operatedByUser.fname", ""] }, " ", { $ifNull: ["$operatedByUser.lname", ""] }],
            },
            createdByUserProfileImage: "$createdByUser.profileImage",
            operatedByUserProfileImage: "$operatedByUser.profileImage",
          },
        },
      ];
      // Fetch results
      console.log(JSON.stringify(commonPipeline));

      const result = await Customer.aggregate(commonPipeline);
      // Count total documents matching the initial match stage
      const totalCount = await Customer.countDocuments(initialMatchStage);

      // Send success response
      UtilController.sendSuccess(req, res, next, {
        rows: result,
        responseCode: returnCode.validSession,
        //pages: Math.ceil(totalCount / pageSize),
        filterRecords: totalCount,
      });
    } catch (err) {
      console.error(err);
      UtilController.sendError(req, res, next, err);
    }
  },

  queryAllCustomerDropdown: async (req, res, next) => {
    try {
      // Match stage to filter based on searchKey and organizationId if provided
      let matchStage = { active: true };
      const effectiveOrganizationId = req.body.organizationId || req.session.organizationId;

      if (req.body.keyword) {
        const searchKey = req.body.keyword;
        matchStage = {
          $or: [
            { customerName: { $regex: searchKey, $options: "i" } },
            { email: { $regex: searchKey, $options: "i" } },
            { companyName: { $regex: searchKey, $options: "i" } },
          ],
        };
      }
      if (effectiveOrganizationId) {
        // Ensure organizationId is a valid ObjectId
        matchStage.organizationId = mongoose.Types.ObjectId(effectiveOrganizationId);
      }

      // Pipeline for fetching customer data for dropdown
      const dropdownPipeline = [
        {
          $match: matchStage, // Apply filtering (e.g., search) if provided
        },
        {
          $lookup: {
            from: "organizations", // Join the organizations collection
            localField: "organizationId",
            foreignField: "_id",
            as: "organization",
          },
        },
        {
          $unwind: {
            path: "$organization", // Unwind the organization array if it exists
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "users", // Join the users collection for createdBy field
            localField: "createdBy",
            foreignField: "_id",
            as: "createdByUser",
          },
        },
        {
          $lookup: {
            from: "users", // Join the users collection for operatedBy field
            localField: "operatedBy",
            foreignField: "_id",
            as: "operatedByUser",
          },
        },
        {
          $unwind: {
            path: "$createdByUser", // Unwind the createdByUser array if it exists
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $unwind: {
            path: "$operatedByUser", // Unwind the operatedByUser array if it exists
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 1, // Include _id field
            customerName: 1, // Include customerName
            companyName: 1, // Include companyName
            email: 1, // Include email
            mobileNo: 1, // Include mobile number
            city: 1, // Include city
            state: 1, // Include state
            country: 1, // Include country
            postalCode: 1, // Include postal code
            logo: 1, // Include logo
            attachment: 1,
            note: 1,
            active: 1, // Include active status
            createdAt: 1, // Include createdAt timestamp
            updatedAt: 1, // Include updatedAt timestamp
            customerId: 1, // Include customerId
            organization: {
              organizationName: "$organization.organizationName", // Include organization name
              _id: "$organization._id", // Include organization _id
            },
            createdByUser: {
              fname: "$createdByUser.fname", // Include fields from createdBy user details
              lname: "$createdByUser.lname",
              _id: "$createdByUser._id",
            },
            operatedByUser: {
              fname: "$operatedByUser.fname", // Include fields from operatedBy user details
              lname: "$operatedByUser.lname",
              _id: "$operatedByUser._id",
            },
          },
        },
      ];

      // Fetch results
      const result = await Customer.aggregate(dropdownPipeline).limit(10);

      // Send success response
      UtilController.sendSuccess(req, res, next, {
        rows: result, // Array of customer data
        responseCode: returnCode.validSession,
      });
    } catch (err) {
      console.error("Error fetching dropdown data:", err);
      UtilController.sendError(req, res, next, {
        message: "An error occurred while fetching customer dropdown data.",
        error: err.message,
        responseCode: returnCode.errror,
      });
    }
  },

  getCustomerById: async (req, res, next) => {
    try {
      const customerId = req.body.customerId;

      const pipeline = [
        {
          $match: { _id: mongoose.Types.ObjectId(customerId) }, // Ensure customerId is a valid ObjectId
        },
        {
          $lookup: {
            from: "organizations", // Collection to join
            localField: "organizationId", // Field from Customer collection
            foreignField: "_id", // Field from Organization collection
            as: "organization", // Name of the output array field
          },
        },
        {
          $unwind: {
            path: "$organization", // Unwind the organization array
            preserveNullAndEmptyArrays: true, // In case some customers don't have an organization
          },
        },
        {
          $project: {
            _id: 1,
            active: 1,
            organizationId: 1,
            logo: 1,
            customerName: 1,
            companyName: 1,
            email: 1,
            mobileNo: 1,
            address: 1,
            city: 1,
            state: 1,
            postalCode: 1,
            country: 1,
            attachment: 1,
            note: 1,
            contactPerson: 1,
            customerId: 1,
            customerTagId: 1,
            createdBy: 1,
            operatedBy: 1,
            createdAt: 1,
            updatedAt: 1,
            countryCode: 1,
            organization: {
              organizationName: 1, // Include organization name
              _id: 1, // Include organization ID
            },
          },
        },
      ];

      // Execute the aggregation pipeline
      const result = await Customer.aggregate(pipeline);

      // Check if the customer was found
      if (result.length === 0) {
        UtilController.sendError(req, res, next, {
          responseCode: returnCode.recordNotFound,
          message: "Customer not found.",
        });
        return;
      }

      // Send success response with customer data
      UtilController.sendSuccess(req, res, next, { customer: result[0] });
    } catch (error) {
      console.error(error);
      UtilController.sendError(req, res, next, error);
    }
  },

  createCustomer: async (req, res, next) => {
    try {
      const createObj = req.body;

      // Using session for createdBy and operatedBy
      createObj["createdBy"] = req.session.userId;
      createObj["operatedBy"] = req.session.userId;

      // Set organizationId from session if not provided in request body
      createObj.organizationId = createObj.organizationId || req.session.organizationId;

      // Define the required fields for customer creation
      const requiredFields = ["email", "mobileNo", "contactPerson"];

      // Validate required fields
      const validationErrors = UtilController.validateRequiredFields(createObj, requiredFields);
      if (validationErrors.length > 0) {
        UtilController.sendError(req, res, next, {
          responseCode: returnCode.incompleteBody,
          message: "Validation errors occurred.",
          errors: validationErrors,
        });
        return;
      }

      // Tag Generation for Customer
      const tagResult = await Tag.findOneAndUpdate(
        { active: true, tagType: "customers" },
        { $inc: { sequenceNo: 1 }, updatedAt: Math.floor(Date.now() / 1000) },
        { new: true }, // Ensure the updated document is returned
      );
      createObj["customerTagId"] = tagResult.prefix + UtilController.pad(tagResult.sequenceNo, 4);

      // Create a new customer in the database
      const newCustomer = new Customer({ ...createObj });
      await newCustomer.save();
      //for superadmin
      let customerDetails = await Customer.findById(newCustomer?._id).populate("organizationId");
      await Notification.create({
        userId: newCustomer._id,
        senderId: newCustomer._id,
        title: `New Customer Created`,
        body: `A new customer has been added to the organization ${customerDetails?.organizationId?.organizationName}. Click to view their details`,
        type: "system",
        read: false,
        visibleOnHome: true,
        actionUrl: `/customers?id=${newCustomer._id}`,
        recordId: newCustomer._id,
        userType: "superAdmin",
      });
      await Notification.create({
        userType: "organizationAdmin",
        recordId: newCustomer._id,
        userId: newCustomer?.organizationId,
        organizationId: req.session.organizationId,
        title: `New Customer Created`,
        body: `A new customer, ${customerDetails?.companyName}, has been added. Click to view their details`,
        type: "system",
        read: false,
        visibleOnHome: true,
        actionUrl: `/customers?id=${newCustomer._id}`,
      });

      // Respond with success
      UtilController.sendSuccess(req, res, next, {
        message: "Customer created successfully.",
        customer: newCustomer, // Return the saved customer object
        code: returnCode.success,
        responseCode: returnCode.validSession,
      });
    } catch (error) {
      console.error("Error creating customer:", error);
      UtilController.sendError(req, res, next, {
        message: "An error occurred while creating the customer.",
        error: error.message,
        code: returnCode.errror,
      });
    }
  },

  updateCustomer: async (req, res, next) => {
    try {
      const updateObj = req.body;

      // Check if customerId is provided in the request body
      if (!updateObj.recordId) {
        UtilController.sendError(req, res, next, {
          responseCode: returnCode.incompleteBody,
          message: "record ID is required.",
        });
        return;
      }

      // Add fields for operation tracking
      updateObj["operatedBy"] = req.session.userId;
      updateObj["updatedAt"] = Math.floor(Date.now() / 1000);

      // Find the customer by customerId and update it
      const customer = await Customer.findByIdAndUpdate(updateObj.recordId, updateObj, { new: true });

      // If the customer is not found, send a 'not found' response
      if (!customer) {
        UtilController.sendError(req, res, next, {
          responseCode: returnCode.recordNotFound,
          message: "Customer not found or update failed.",
        });
        return;
      }

      // Send success response with updated customer data
      UtilController.sendSuccess(req, res, next, {
        message: "Customer updated successfully.",
        customer,
        responseCode: returnCode.validSession,
      });
    } catch (error) {
      console.error("Error updating customer:", error);
      UtilController.sendError(req, res, next, {
        message: "An error occurred while updating the customer.",
        error: error.message,
        responseCode: returnCode.errror,
      });
    }
  },

  deleteCustomer: async (req, res, next) => {
    try {
      const { customerIds } = req.body; // Expecting an array of customer IDs
      if (!Array.isArray(customerIds) || customerIds.length === 0) {
        UtilController.sendError(req, res, next, returnCode.incompleteBody);
      }
      await Customer.updateMany(
        { _id: { $in: customerIds } }, // Find customers with IDs in the provided array
        { active: false }, // Set 'active' to false for soft delete
      );

      UtilController.sendSuccess(req, res, next, {
        message: "Customers marked as inactive (soft deleted) successfully.",
        code: returnCode.success, // Success code
        responseCode: returnCode.validSession,
      });
    } catch (error) {
      console.error(error);
      UtilController.sendError(req, res, next, error.message);
    }
  },

  uploadFiles: async (req, res, next) => {
    try {
      UtilController.uploadFiles(req, res, next);
    } catch (err) {
      console.log("uploadFiles -catch");
      console.log(err);
      UtilController.sendError(req, res, next, err);
    }
  },

  // API to get all users for dropdown selection with search keyword
  queryCreatedByUsers: async (req, res, next) => {
    try {
      // Extract search keyword from request query
      const { keyword } = req.query;
      const { organizationId } = req.session;

      // Aggregate pipeline to get distinct createdBy users
      const pipeline = [
        {
          $lookup: {
            from: "users",
            localField: "createdBy",
            foreignField: "_id",
            as: "createdByUser",
          },
        },
        {
          $unwind: {
            path: "$createdByUser",
            preserveNullAndEmptyArrays: false,
          },
        },
        // Add match stage for organizationId
        {
          $match: {
            organizationId: mongoose.Types.ObjectId(organizationId),
          },
        },
        {
          $group: {
            _id: "$createdByUser._id",
            fname: { $first: "$createdByUser.fname" },
            lname: { $first: "$createdByUser.lname" },
          },
        },
        // Add a match stage for filtering based on keyword
        ...(keyword
          ? [
              {
                $match: {
                  $or: [
                    { fname: { $regex: keyword, $options: "i" } }, // Match first name
                    { lname: { $regex: keyword, $options: "i" } }, // Match last name
                  ],
                },
              },
            ]
          : []), // Skip match if no keyword is provided
        {
          $sort: { fname: 1 }, // Sort by first name
        },
        {
          $project: {
            _id: 1, // User ID
            fname: 1, // First Name
            lname: 1, // Last Name
          },
        },
      ];

      // Fetch results
      let result = await Customer.aggregate(pipeline);

      // Send success response
      UtilController.sendSuccess(req, res, next, {
        result,
      });
    } catch (err) {
      console.error(err);
      UtilController.sendError(req, res, next, err);
    }
  },

  uploadbulkCustomer: async (req, res, next) => {
    try {
      let fileupload = req.body;
      let organizationId = fileupload.organizationId;
      fileupload["userId"] = req.body.userId;
      fileupload["createdBy"] = req.body.userId;
      fileupload["operatedBy"] = req.body.userId;
      fileupload["uploadedBy"] = req.body.userId;
      fileupload["organizationId"] = organizationId;
      fileupload["status"] = "inprocess";
      fileupload["collectionName"] = "customers";
      fileupload["operationType"] = "uploadBulkCustomers";
      fileupload["trackId"] = Math.random().toString(36).slice(-8).toUpperCase();

      const folderName = req.body.folderName || "uploads";
      if (UtilController.isEmpty(fileupload.organizationId)) {
        return UtilController.sendError(req, res, next, {
          message: "Organization Id is required",
          responseCode: returnCode.incompleteBody,
        });
      }

      if (!req.files || !req.files.attachment) {
        return res.status(400).json({ error: "No files were uploaded." });
      }

      const uploadRes = UploadController.uploadFile_inReq(req, folderName);

      fileupload["uploadedFilePath"] = uploadRes.fileLinks[0];
      let response = await DataFileUpload.create(fileupload);

      const localPath = uploadRes.newPath;
      const result = await UploadedDatafileProcessing.processFile(response, localPath, req.session.userId, req);
      if (result.error || result.errors) {
        throw new Error(result.error || result);
      }
      UtilController.sendSuccess(req, res, next, {
        message: "File(s) uploaded successfully!",
        result,
      });
    } catch (err) {
      console.error("error during bulk user upload");
      UtilController.sendError(req, res, next, err);
    }
  },
};
