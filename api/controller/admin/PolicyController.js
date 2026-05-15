let request = require("request");
let mongoose = require("mongoose");
const Policy = require("../../models/Policy");
const { parsePhoneNumberFromString } = require("libphonenumber-js");
const UtilController = require("../services/UtilController");
const Quote = require("../../models/Quote");
const returnCode = require("../../../config/responseCode").returnCode;

module.exports = {
  createPolicy: async (req, res) => {
    try {
      const { name, description, attachment, audienceId, policyIcon } = req.body;
      if (UtilController.isEmpty(req.session.organizationId)) throw { message: "Organization Id is required" };

      const newPolicy = new Policy({
        organizationId: req.session.organizationId,
        audienceId,
        name,
        description,
        attachment,
        policyIcon,
      });

      const savedPolicy = await newPolicy.save();
      res.status(201).json({ message: "Policy created successfully", data: savedPolicy });
    } catch (error) {
      res.status(500).json({ message: "Error creating Policy", error: error.message });
    }
  },

  deletePolicy: async (req, res, next) => {
    try {
      let policyId = req.body.recordId;

      await Policy.updateMany(
        { _id: { $in: [policyId] } },
        {
          $set: {
            active: false,
            operatedBy: req.session.userId,
            updatedAt: Math.floor(Date.now() / 1000),
          },
        },
        { new: true },
      );

      UtilController.sendSuccess(req, res, next, {
        message: "Policy deleted successfully",
      });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },
  getPolicyById: async (req, res, next) => {
    try {
      const recordId = req.body.recordId;
      let organizationId;
      if (!req.session.isSuperAdmin) {
        organizationId = req.session.organizationId;
      }

      if (!recordId) {
        return UtilController.sendError(req, res, next, {
          message: "Invalid Policy id",
          responseCode: returnCode.incompleteBody,
        });
      }

      let matchStage = {
        _id: mongoose.Types.ObjectId(recordId),
        active: true,
      };

      if (organizationId) {
        matchStage.organizationId = mongoose.Types.ObjectId(organizationId);
      }

      const pipeline = [
        {
          $match: matchStage,
        },

        {
          $lookup: {
            from: "organizations",
            localField: "organizationId",
            foreignField: "_id",
            as: "organization",
          },
        },
        {
          $unwind: {
            path: "$organization",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 1,
            name: 1,
            categoryId: 1,
            categoryName: 1,
            description: 1,
            attachment: 1,
            audienceId: 1,
            policyIcon: 1,
            createdAt: 1,
            updatedAt: 1,
            organization: 1,
            organization: {
              name: "$organization.organizationName",
              _id: "$organization._id",
            },
          },
        },
      ];

      const [result] = await Policy.aggregate(pipeline);
      console.log("result", result);
      return UtilController.sendSuccess(req, res, next, {
        data: result,
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },

  updatePolicy: async (req, res, next) => {
    try {
      const updateObj = req.body;

      if (!updateObj.policyId) {
        UtilController.sendError(req, res, next, {
          responseCode: returnCode.incompleteBody,
          message: "policyId is required.",
        });
        return;
      }

      // Add fields for operation tracking
      updateObj["operatedBy"] = req.session.userId;
      updateObj["updatedAt"] = Math.floor(Date.now() / 1000);

      // Find the policy by policyId and update it
      const policy = await Policy.findByIdAndUpdate(updateObj.policyId, updateObj, { new: true });

      // If the policy is not found, send a 'not found' response
      if (!policy) {
        UtilController.sendError(req, res, next, {
          responseCode: returnCode.recordNotFound,
          message: "policy not found or update failed.",
        });
        return;
      }

      // Send success response with updated policy data
      UtilController.sendSuccess(req, res, next, {
        message: "policy updated successfully.",
        policy,
        responseCode: returnCode.validSession,
      });
    } catch (error) {
      console.error("Error updating policy:", error);
      UtilController.sendError(req, res, next, {
        message: "An error occurred while updating the policy.",
        error: error.message,
        responseCode: returnCode.errror,
      });
    }
  },
  listPolicy: async (req, res, next) => {
    try {
      //apply sort, search, pagination
      let search = {};
      let userId = req.session.userId;
      let userType = req.session.userType;
      if (!UtilController.isEmpty(req.body.keyword)) {
        search["$or"] = [
          { categoryName: { $regex: req.body.keyword, $options: "i" } },
          { name: { $regex: req.body.keyword, $options: "i" } },
        ];
      }

      let match = {
        active: true,
      };
      if (!UtilController.isEmpty(req.session.organizationId))
        match["organizationId"] = mongoose.Types.ObjectId(req.session.organizationId);
      if (!UtilController.isEmpty(req.body.active)) match["active"] = req.body.active;

      let sort = {};
      if (!UtilController.isEmpty(req.body.sortField) && !UtilController.isEmpty(req.body.sortOrder)) {
        let sortField = req.body.sortField;
        let sortOrder = req.body.sortOrder;

        sort[sortField] = sortOrder;
      } else {
        sort = { updatedAt: -1 };
      }

      let pageSize = 10;
      let page = 0;
      if (!UtilController.isEmpty(req.body.pageSize)) pageSize = req.body.pageSize;
      if (!UtilController.isEmpty(req.body.page)) page = req.body.page;

      const policies = await Policy.aggregate([
        { $match: match },

        {
          $lookup: {
            from: "organizations",
            localField: "organizationId",
            foreignField: "_id",
            as: "organization",
          },
        },
        {
          $unwind: {
            path: "$organization",
            preserveNullAndEmptyArrays: true,
          },
        },
        { $match: search },
        {
          $facet: {
            totalCount: [{ $count: "count" }],
            data: [{ $sort: sort }, { $skip: page * pageSize }, { $limit: pageSize }],
          },
        },
      ]);
      const totalCount = policies?.[0].totalCount?.[0] ? policies[0].totalCount[0].count : 0;
      const rows = policies?.[0]?.data;
      const pages = Math.ceil(totalCount / pageSize);

      UtilController.sendSuccess(req, res, next, {
        rows: rows,
        filterRecords: totalCount,
        pages: pages,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
};
