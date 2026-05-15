const mongoose = require("mongoose");
const MainProject = require("../../models/MainProject");
const UtilController = require("../services/UtilController");
const returnCode = require("../../../config/responseCode").returnCode;

module.exports = {
  listMainProjects: async (req, res, next) => {
    try {
      const match = { active: true };
      if (!UtilController.isEmpty(req.session.organizationId)) {
        match.organizationId = mongoose.Types.ObjectId(req.session.organizationId);
      } else if (!UtilController.isEmpty(req.body.organizationId)) {
        match.organizationId = mongoose.Types.ObjectId(req.body.organizationId);
      }
      const keyword = (req.body.keyword || "").trim();
      const typeFilter = (req.body.spaceType || "").trim();

      if (keyword) {
        match.$or = [
          { name: { $regex: keyword, $options: "i" } },
          { projectKey: { $regex: keyword, $options: "i" } },
        ];
      }
      if (typeFilter && typeFilter !== "all") {
        match.spaceType = typeFilter;
      }

      let sort = { updatedAt: -1 };
      if (!UtilController.isEmpty(req.body.sortField) && !UtilController.isEmpty(req.body.sortOrder)) {
        sort = {
          [req.body.sortField]: req.body.sortOrder === "false" || req.body.sortOrder === false ? -1 : 1,
        };
      }

      let pageSize = 10;
      let page = 0;
      if (!UtilController.isEmpty(req.body.pageSize)) pageSize = Number(req.body.pageSize);
      if (!UtilController.isEmpty(req.body.page)) page = Number(req.body.page);

      const rows = await MainProject.aggregate([
        { $match: match },
        {
          $lookup: {
            from: "users",
            localField: "lead",
            foreignField: "_id",
            as: "leadUser",
          },
        },
        { $unwind: { path: "$leadUser", preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            leadName: {
              $trim: {
                input: {
                  $concat: [
                    { $ifNull: ["$leadUser.fname", ""] },
                    " ",
                    { $ifNull: ["$leadUser.lname", ""] },
                  ],
                },
              },
            },
          },
        },
        {
          $project: {
            leadUser: 0,
          },
        },
        { $sort: sort },
        {
          $facet: {
            totalCount: [{ $count: "count" }],
            data: [{ $skip: page * pageSize }, { $limit: pageSize }],
          },
        },
      ]);

      const totalCount = rows?.[0]?.totalCount?.[0]?.count || 0;
      const data = rows?.[0]?.data || [];
      const pages = Math.ceil(totalCount / pageSize) || 1;

      UtilController.sendSuccess(req, res, next, {
        rows: data,
        filterRecords: totalCount,
        pages,
        responseCode: returnCode.validSession,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },

  createMainProject: async (req, res, next) => {
    try {
      if (UtilController.isEmpty(req.session.organizationId)) {
        return UtilController.sendError(req, res, next, {
          message: "Organization Id is required",
          responseCode: returnCode.incompleteBody,
        });
      }

      const name = (req.body.name || "").trim();
      const projectKey = (req.body.projectKey || req.body.key || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      const spaceType = (req.body.spaceType || "Team-managed software").trim();
      const lead = req.body.leadId || req.body.lead;

      if (!name) {
        return UtilController.sendError(req, res, next, {
          message: "Name is required",
          responseCode: returnCode.incompleteBody,
        });
      }
      if (!projectKey || projectKey.length < 2) {
        return UtilController.sendError(req, res, next, {
          message: "Project key must be at least 2 characters (letters and numbers only)",
          responseCode: returnCode.incompleteBody,
        });
      }

      const exists = await MainProject.findOne({
        organizationId: mongoose.Types.ObjectId(req.session.organizationId),
        projectKey,
        active: true,
      }).lean();

      if (exists) {
        return UtilController.sendError(req, res, next, {
          message: "A space with this key already exists in your organization",
          responseCode: returnCode.duplicate,
        });
      }

      const doc = new MainProject({
        organizationId: req.session.organizationId,
        name,
        projectKey,
        spaceType,
        lead: lead ? mongoose.Types.ObjectId(lead) : undefined,
        isStarred: !!req.body.isStarred,
        createdBy: req.session.userId,
        operatedBy: req.session.userId,
        updatedAt: Math.floor(Date.now() / 1000),
      });

      const saved = await doc.save();
      UtilController.sendSuccess(req, res, next, {
        mainProject: saved,
        message: "Main project created successfully",
        responseCode: returnCode.validSession,
      });
    } catch (err) {
      if (err && err.code === 11000) {
        return UtilController.sendError(req, res, next, {
          message: "Duplicate project key for this organization",
          responseCode: returnCode.duplicate,
        });
      }
      UtilController.sendError(req, res, next, err);
    }
  },

  updateMainProject: async (req, res, next) => {
    try {
      const recordId = req.body.recordId || req.body.mainProjectId;
      if (UtilController.isEmpty(recordId)) {
        return UtilController.sendError(req, res, next, {
          message: "recordId is required",
          responseCode: returnCode.incompleteBody,
        });
      }

      const match = {
        _id: mongoose.Types.ObjectId(recordId),
        active: true,
      };
      if (!UtilController.isEmpty(req.session.organizationId)) {
        match.organizationId = mongoose.Types.ObjectId(req.session.organizationId);
      }

      const update = { updatedAt: Math.floor(Date.now() / 1000), operatedBy: req.session.userId };
      if (typeof req.body.isStarred === "boolean") update.isStarred = req.body.isStarred;
      if (req.body.name !== undefined) update.name = String(req.body.name).trim();
      if (req.body.spaceType !== undefined) update.spaceType = String(req.body.spaceType).trim();
      if (req.body.leadId !== undefined || req.body.lead !== undefined) {
        const lead = req.body.leadId || req.body.lead;
        update.lead = lead ? mongoose.Types.ObjectId(lead) : null;
      }

      const updated = await MainProject.findOneAndUpdate(match, { $set: update }, { new: true });
      if (!updated) {
        return UtilController.sendError(req, res, next, {
          message: "Record not found",
          responseCode: returnCode.recordNotFound,
        });
      }

      UtilController.sendSuccess(req, res, next, {
        mainProject: updated,
        message: "Updated successfully",
        responseCode: returnCode.validSession,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },

  deleteMainProject: async (req, res, next) => {
    try {
      const recordId = req.body.recordId || req.body.mainProjectId;
      if (UtilController.isEmpty(recordId)) {
        return UtilController.sendError(req, res, next, {
          message: "recordId is required",
          responseCode: returnCode.incompleteBody,
        });
      }

      const match = {
        _id: mongoose.Types.ObjectId(recordId),
        active: true,
      };
      if (!UtilController.isEmpty(req.session.organizationId)) {
        match.organizationId = mongoose.Types.ObjectId(req.session.organizationId);
      }

      const updated = await MainProject.findOneAndUpdate(
        match,
        {
          $set: {
            active: false,
            updatedAt: Math.floor(Date.now() / 1000),
            operatedBy: req.session.userId,
          },
        },
        { new: true },
      );

      if (!updated) {
        return UtilController.sendError(req, res, next, {
          message: "Record not found",
          responseCode: returnCode.recordNotFound,
        });
      }

      UtilController.sendSuccess(req, res, next, {
        message: "Deleted successfully",
        responseCode: returnCode.validSession,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
};
