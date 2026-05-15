const EmailTemplate = require("../../models/EmailTemplates");
const UtilController = require("../services/UtilController");
const Tag = require("../../models/Tag");
const mongoose = require("mongoose");
const WorkAllocation = require("../../models/WorkAllocations");
const User = require("../../models/User");
const returnCode = require("../../../config/responseCode").returnCode;

module.exports = {
  createEmailTemplate: async (req, res, next) => {
    try {
      let organizationId = req.session.organizationId ?? req.body.organizationId;
      let createObj = req.body;
      createObj["operatedBy"] = req.session.userId;
      createObj["updatedBy"] = req.session.userId;
      createObj["createdBy"] = req.session.userId;
      createObj["organizationId"] = organizationId;
      let tagResult = await Tag.findOneAndUpdate(
        {
          active: true,
          tagType: "emailTemplate",
        },
        {
          $inc: { sequenceNo: 1 },
          updatedAt: Math.floor(Date.now() / 1000),
        },
      );
      createObj["templateId"] = tagResult.prefix + UtilController.pad(tagResult.sequenceNo, 4);

      const emailTemResponse = await EmailTemplate.create(createObj);
      UtilController.sendSuccess(req, res, next, { emailTemResponse });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },
  updateEmailTemplate: async (req, res, next) => {
    try {
      const updateObj = req.body;
      let recordId = updateObj.recordId;
      delete updateObj.recordId;
      updateObj["updatedBy"] = req.session.userId;
      updateObj["updatedAt"] = Math.floor(Date.now() / 1000);
      const emailTemRes = await EmailTemplate.findByIdAndUpdate(recordId, updateObj, { new: true });
      UtilController.sendSuccess(req, res, next, { emailTemRes });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },
  deleteEmailTemplate: async (req, res, next) => {
    try {
      let recordId = req.body.recordId;
      await EmailTemplate.updateMany(
        { _id: { $in: recordId } },
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
        message: "Project deleted successfully",
      });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },
  listAllEmailTemplate: async (req, res, next) => {
    try {
      //apply sort, search, pagination
      let search = {};
      let organizationId = req.session.organizationId;
      if (!UtilController.isEmpty(req.body.keyword)) {
        search["$or"] = [
          // { "scuId.title": { $regex: req.body.keyword, $options: "i" } },
          { templateId: { $regex: req.body.keyword, $options: "i" } },
          { emailTitle: { $regex: req.body.keyword, $options: "i" } },
        ];
      }
      let match = {
        active: true,
      };

      if (!UtilController.isEmpty(req.body.active)) match["active"] = req.body.active;
      if (!UtilController.isEmpty(req.body.createdBy)) {
        match["createdBy"] = mongoose.Types.ObjectId(req.body.createdBy);
      }
      if (!UtilController.isEmpty(organizationId)) {
        match["organizationId"] = mongoose.Types.ObjectId(organizationId);
      }
      if (!UtilController.isEmpty(req.body.startDate) || !UtilController.isEmpty(req.body.endDate)) {
        match["$and"] = [];
        if (!UtilController.isEmpty(req.body.startDate))
          match["$and"].push({ createdAt: { $gte: req.body.startDate } });

        if (!UtilController.isEmpty(req.body.endDate)) match["$and"].push({ createdAt: { $lte: req.body.endDate } });
      }

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

      const emailTemRes = await EmailTemplate.aggregate([
        { $match: match },
        {
          $lookup: {
            from: "users",
            localField: "createdBy",
            foreignField: "_id",
            as: "createdBy",
          },
        },
        {
          $unwind: {
            path: "$createdBy",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "operatedBy",
            foreignField: "_id",
            as: "operatedBy",
          },
        },
        {
          $unwind: {
            path: "$operatedBy",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "updatedBy",
            foreignField: "_id",
            as: "updatedBy",
          },
        },
        {
          $unwind: {
            path: "$updatedBy",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 1,
            templateId: 1,
            emailTitle: 1,
            emailDescription: 1,
            emailAttachment: 1,
            createdBy: {
              $concat: [{ $ifNull: ["$createdBy.fname", ""] }, " ", { $ifNull: ["$createdBy.lname", ""] }],
            },
            operatedBy: {
              $concat: [{ $ifNull: ["$operatedBy.fname", ""] }, " ", { $ifNull: ["$operatedBy.lname", ""] }],
            },
            updatedBy: {
              $concat: [{ $ifNull: ["$updatedBy.fname", ""] }, " ", { $ifNull: ["$updatedBy.lname", ""] }],
            },
            createdAt: 1,
            updatedAt: 1,
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
      const totalCount = emailTemRes?.[0].totalCount?.[0] ? emailTemRes[0].totalCount[0].count : 0;
      const rows = emailTemRes?.[0]?.data;
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
  emailTemplateDetailById: async (req, res, next) => {
    try {
      const emailTemRes = await EmailTemplate.findById(req.body.recordId)
        .populate("createdBy", "fname lname")
        .populate("updatedBy", "fname lname");
      UtilController.sendSuccess(req, res, next, { emailTemRes });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },
  allEmailTemplateDropdown: async (req, res, next) => {
    try {
      let search = {};
      if (!UtilController.isEmpty(req.body.keyword)) {
        search["$or"] = [
          { templateId: { $regex: req.body.keyword, $options: "i" } },
          { emailTitle: { $regex: req.body.keyword, $options: "i" } },
        ];
      }
      let match = {
        active: true,
      };
      let sort = { updatedAt: -1 };
      let pageSize = 10;
      let page = 0;

      const emailTemRes = await EmailTemplate.aggregate([
        { $match: match },

        {
          $lookup: {
            from: "users",
            localField: "createdBy",
            foreignField: "_id",
            as: "createdBy",
          },
        },
        {
          $unwind: {
            path: "$createdBy",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "operatedBy",
            foreignField: "_id",
            as: "operatedBy",
          },
        },
        {
          $unwind: {
            path: "$operatedBy",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 1,
            templateId: 1,
            emailTitle: 1,
            emailDescription: 1,
            emailAttachments: 1,
            createdAt: 1,
            updatedAt: 1,
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
      const totalCount = emailTemRes[0].totalCount[0] ? emailTemRes[0].totalCount[0].count : 0;
      const rows = emailTemRes[0].data;
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
  queryCreatedByEmailTemplate: async (req, res, next) => {
    try {
      const { keyword } = req.query;
      let organizationId = req.session.organizationId;

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

        ...(keyword
          ? [
              {
                $match: {
                  $or: [{ fname: { $regex: keyword, $options: "i" } }, { lname: { $regex: keyword, $options: "i" } }],
                },
              },
            ]
          : []),
        {
          $sort: { fname: 1 },
        },
        {
          $project: {
            _id: 1,
            fname: 1,
            lname: 1,
          },
        },
      ];

      let result = await EmailTemplate.aggregate(pipeline);

      UtilController.sendSuccess(req, res, next, {
        result,
      });
    } catch (err) {
      console.error(err);
      UtilController.sendError(req, res, next, err);
    }
  },
  replaceDynamicVariables: (content, receiverDetails) => {
    const htmlDecode = html => {
      return html
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    };
    let decodedContent = htmlDecode(content);
    decodedContent = decodedContent.replace(/@name/g, `${receiverDetails.fname} ${receiverDetails.lname}`);
    decodedContent = decodedContent.replace(/@mobileNo/g, receiverDetails.mobileNo);

    return decodedContent;
  },

  sendEmailToParticularUser: async (req, res, next) => {
    try {
      let extractedContent = null;
      let { title, content, receiver, attachment } = req.body;
      for (i = 0; i < receiver?.length; i++) {
        extractedContent = module.exports.replaceDynamicVariables(content, receiver[i]);
      }
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
};
