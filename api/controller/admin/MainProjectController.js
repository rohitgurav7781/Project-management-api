const MainProject = require("../../models/MainProject");
const SpaceIssue = require("../../models/SpaceIssue");
const { getSpaceTemplateConfig } = require("../../../config/spaceTemplateDefaults");
const UtilController = require("../services/UtilController");
const {
  nowTs,
  toObjectId,
  recordIdFrom,
  listMatch,
  projectMatchById,
  activeProjectMatch,
  leadLookupStages,
  parsePagination,
  parseSort,
  normalizeProjectKey,
  sendValidationError,
  sendNotFound,
  requireOrganization,
  touchMeta,
  nextSpaceIssueKey,
  returnCode,
} = require("./mainProjectHelpers");

const handleDuplicateKey = (req, res, next, err) => {
  if (err?.code === 11000) {
    const isIssueKey = err?.keyPattern?.issueKey != null;
    return UtilController.sendError(req, res, next, {
      message: isIssueKey
        ? "Could not create task. Please try again."
        : "Duplicate project key for this organization",
      responseCode: returnCode.duplicate,
    });
  }
  return UtilController.sendError(req, res, next, err);
};

const normalizeStatusKey = (value) =>
  String(value || "TODO")
    .trim()
    .replace(/\s+/g, "_")
    .toUpperCase();

module.exports = {
  listMainProjects: async (req, res, next) => {
    try {
      const { page, pageSize } = parsePagination(req.body);
      const match = listMatch(req, req.body);
      const sort = parseSort(req.body);

      const [result] = await MainProject.aggregate([
        { $match: match },
        ...leadLookupStages,
        { $sort: sort },
        {
          $facet: {
            totalCount: [{ $count: "count" }],
            data: [{ $skip: page * pageSize }, { $limit: pageSize }],
          },
        },
      ]);

      const totalCount = result?.totalCount?.[0]?.count || 0;

      UtilController.sendSuccess(req, res, next, {
        rows: result?.data || [],
        filterRecords: totalCount,
        pages: Math.ceil(totalCount / pageSize) || 1,
        responseCode: returnCode.validSession,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },

  createMainProject: async (req, res, next) => {
    try {
      if (!requireOrganization(req, res, next)) return;

      const name = (req.body.name || "").trim();
      const projectKey = normalizeProjectKey(req.body.projectKey || req.body.key);
      const templateId = (req.body.templateId || "kanban").trim();
      const templateConfig = getSpaceTemplateConfig(templateId);
      const spaceType = (req.body.spaceType || templateConfig.spaceType || "Team-managed software").trim();
      const managerId = req.body.managerId || req.body.leadId || req.body.teamLeadId;
      const accessScope = String(req.body.accessScope || "team").toLowerCase() === "company" ? "company" : "team";
      const orgId = toObjectId(req.session.organizationId);

      if (!name) return sendValidationError(req, res, next, "Name is required");
      if (projectKey.length < 2) {
        return sendValidationError(
          req,
          res,
          next,
          "Project key must be at least 2 characters (letters and numbers only)",
        );
      }

      const exists = await MainProject.findOne({ organizationId: orgId, projectKey, active: true }).lean();
      if (exists) {
        return UtilController.sendError(req, res, next, {
          message: "A space with this key already exists in your organization",
          responseCode: returnCode.duplicate,
        });
      }

      const saved = await new MainProject({
        organizationId: req.session.organizationId,
        name,
        projectKey,
        spaceType,
        templateId: templateConfig.templateId,
        boardType: templateConfig.boardType,
        boardColumns: templateConfig.boardColumns,
        workTypes: templateConfig.workTypes,
        workflowStatuses: templateConfig.workflowStatuses,
        lead: managerId ? toObjectId(managerId) : undefined,
        accessScope,
        isStarred: !!req.body.isStarred,
        createdBy: req.session.userId,
        operatedBy: req.session.userId,
        updatedAt: nowTs(),
      }).save();

      const welcomeIssueKey = await nextSpaceIssueKey(saved._id, projectKey);
      const welcomeIssue = await new SpaceIssue({
        organizationId: req.session.organizationId,
        mainProjectId: saved._id,
        issueKey: welcomeIssueKey,
        title: `Welcome to ${name}`,
        issueType: templateConfig.boardType === "scrum" ? "story" : "task",
        statusKey: templateConfig.boardColumns[0]?.statusKey || "TODO",
        sortOrder: 0,
        createdBy: req.session.userId,
      }).save();

      UtilController.sendSuccess(req, res, next, {
        mainProject: saved,
        welcomeIssue,
        message: "Space created successfully",
        responseCode: returnCode.validSession,
      });
    } catch (err) {
      handleDuplicateKey(req, res, next, err);
    }
  },

  updateMainProject: async (req, res, next) => {
    try {
      const recordId = recordIdFrom(req.body, "recordId", "mainProjectId");
      if (!recordId) return sendValidationError(req, res, next, "recordId is required");

      const update = { ...touchMeta(req) };
      if (typeof req.body.isStarred === "boolean") update.isStarred = req.body.isStarred;
      if (typeof req.body.isArchived === "boolean") update.isArchived = req.body.isArchived;
      if (req.body.name !== undefined) update.name = String(req.body.name).trim();
      if (req.body.spaceType !== undefined) update.spaceType = String(req.body.spaceType).trim();

      if (req.body.managerId !== undefined || req.body.leadId !== undefined) {
        const id = req.body.managerId ?? req.body.leadId;
        update.lead = id ? toObjectId(id) : null;
      }
      if (req.body.teamLeadId !== undefined) {
        update.teamLead = req.body.teamLeadId ? toObjectId(req.body.teamLeadId) : null;
      }
      if (req.body.accessScope !== undefined) {
        const s = String(req.body.accessScope).toLowerCase();
        update.accessScope = s === "company" ? "company" : "team";
      }

      const updated = await MainProject.findOneAndUpdate(
        activeProjectMatch(req, recordId),
        { $set: update },
        { new: true },
      );

      if (!updated) return sendNotFound(req, res, next);

      UtilController.sendSuccess(req, res, next, {
        mainProject: updated,
        message: "Updated successfully",
        responseCode: returnCode.validSession,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },

  getMainProjectDetails: async (req, res, next) => {
    try {
      const recordId = recordIdFrom(req.body, "recordId", "mainProjectId");
      if (!recordId) return sendValidationError(req, res, next, "recordId is required");

      const project = await MainProject.findOne(projectMatchById(req, recordId)).lean();
      if (!project) return sendNotFound(req, res, next);

      const issues = await SpaceIssue.find({
        mainProjectId: project._id,
        active: true,
        isArchived: { $ne: true },
      })
        .sort({ statusKey: 1, sortOrder: 1, createdAt: 1 })
        .lean();

      UtilController.sendSuccess(req, res, next, {
        mainProject: project,
        issues,
        responseCode: returnCode.validSession,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },

  createSpaceIssue: async (req, res, next) => {
    try {
      if (!requireOrganization(req, res, next)) return;

      const mainProjectId = recordIdFrom(req.body, "mainProjectId", "recordId");
      const title = (req.body.title || "").trim();
      const issueType = (req.body.issueType || "task").trim();
      const statusKey = normalizeStatusKey(req.body.statusKey);
      const assigneeId = req.body.assigneeId || req.body.assignee;
      const parentIssueId = req.body.parentIssueId;
      const description = req.body.description != null ? String(req.body.description).trim() : "";

      if (!mainProjectId || !title) {
        return sendValidationError(req, res, next, "mainProjectId and title are required");
      }

      const project = await MainProject.findOne(projectMatchById(req, mainProjectId)).lean();
      if (!project) return sendNotFound(req, res, next, "Space not found");

      let parentIssue = null;
      if (parentIssueId) {
        parentIssue = await SpaceIssue.findOne({
          _id: toObjectId(parentIssueId),
          mainProjectId: project._id,
          active: true,
          organizationId: toObjectId(req.session.organizationId),
        }).lean();
        if (!parentIssue) return sendNotFound(req, res, next, "Parent issue not found");
      }

      const sortOrder = await SpaceIssue.countDocuments({ mainProjectId: project._id, active: true });
      const issueKey = await nextSpaceIssueKey(project._id, project.projectKey);
      const issue = await new SpaceIssue({
        organizationId: req.session.organizationId,
        mainProjectId: project._id,
        issueKey,
        title,
        description,
        parentIssueId: parentIssue ? parentIssue._id : undefined,
        issueType,
        statusKey,
        assignee: assigneeId ? toObjectId(assigneeId) : undefined,
        sortOrder,
        createdBy: req.session.userId,
      }).save();

      UtilController.sendSuccess(req, res, next, {
        issue,
        responseCode: returnCode.validSession,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },

  getSpaceIssueDetails: async (req, res, next) => {
    try {
      const issueId = recordIdFrom(req.body, "issueId", "recordId");
      if (!issueId) return sendValidationError(req, res, next, "issueId is required");

      const issue = await SpaceIssue.findOne({
        _id: toObjectId(issueId),
        active: true,
        organizationId: toObjectId(req.session.organizationId),
      }).lean();

      if (!issue) return sendNotFound(req, res, next, "Issue not found");

      const subtasks = await SpaceIssue.find({
        parentIssueId: issue._id,
        active: true,
        isArchived: { $ne: true },
      })
        .sort({ sortOrder: 1, createdAt: 1 })
        .lean();

      UtilController.sendSuccess(req, res, next, {
        issue,
        subtasks,
        responseCode: returnCode.validSession,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },

  updateSpaceIssue: async (req, res, next) => {
    try {
      const issueId = recordIdFrom(req.body, "issueId", "recordId");
      if (!issueId) return sendValidationError(req, res, next, "issueId is required");

      const update = { updatedAt: nowTs() };
      if (req.body.title !== undefined) update.title = String(req.body.title).trim();
      if (req.body.description !== undefined) update.description = String(req.body.description).trim();
      if (req.body.statusKey !== undefined) update.statusKey = normalizeStatusKey(req.body.statusKey);
      if (req.body.issueType !== undefined) update.issueType = String(req.body.issueType).trim();
      if (req.body.sortOrder !== undefined) update.sortOrder = Number(req.body.sortOrder);
      if (req.body.assigneeId !== undefined || req.body.assignee !== undefined) {
        const assigneeId = req.body.assigneeId ?? req.body.assignee;
        update.assignee = assigneeId ? toObjectId(assigneeId) : null;
      }
      if (req.body.isArchived !== undefined) update.isArchived = !!req.body.isArchived;
      if (req.body.active !== undefined) update.active = !!req.body.active;

      const issue = await SpaceIssue.findOneAndUpdate(
        {
          _id: toObjectId(issueId),
          active: true,
          organizationId: toObjectId(req.session.organizationId),
        },
        { $set: update },
        { new: true },
      );

      if (!issue) return sendNotFound(req, res, next, "Issue not found");

      UtilController.sendSuccess(req, res, next, {
        issue,
        responseCode: returnCode.validSession,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },

  deleteMainProject: async (req, res, next) => {
    try {
      const recordId = recordIdFrom(req.body, "recordId", "mainProjectId");
      if (!recordId) return sendValidationError(req, res, next, "recordId is required");

      const ts = nowTs();
      const updated = await MainProject.findOneAndUpdate(
        activeProjectMatch(req, recordId),
        { $set: { active: false, updatedAt: ts, operatedBy: req.session.userId } },
        { new: true },
      );

      if (!updated) return sendNotFound(req, res, next);

      await SpaceIssue.updateMany(
        { mainProjectId: updated._id, active: true },
        { $set: { active: false, updatedAt: ts } },
      );

      UtilController.sendSuccess(req, res, next, {
        message: "Deleted successfully",
        responseCode: returnCode.validSession,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
};
