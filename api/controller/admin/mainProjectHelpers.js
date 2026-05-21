const mongoose = require("mongoose");
const SpaceIssue = require("../../models/SpaceIssue");
const UtilController = require("../services/UtilController");
const returnCode = require("../../../config/responseCode").returnCode;

const nowTs = () => Math.floor(Date.now() / 1000);

const toObjectId = (id) => (UtilController.isEmpty(id) ? null : mongoose.Types.ObjectId(id));

const recordIdFrom = (body, ...keys) => {
  for (const key of keys) {
    const value = body[key];
    if (!UtilController.isEmpty(value)) return value;
  }
  return null;
};

const orgMatch = (req, { allowArchived = false } = {}) => {
  const match = { active: true };
  if (!allowArchived) match.isArchived = { $ne: true };
  if (!UtilController.isEmpty(req.session.organizationId)) {
    match.organizationId = toObjectId(req.session.organizationId);
  }
  return match;
};

const listMatch = (req, body = {}) => {
  const match = { active: true, isArchived: { $ne: true } };
  const orgId = req.session.organizationId || body.organizationId;
  if (!UtilController.isEmpty(orgId)) {
    match.organizationId = toObjectId(orgId);
  }

  const keyword = (body.keyword || "").trim();
  if (keyword) {
    match.$or = [
      { name: { $regex: keyword, $options: "i" } },
      { projectKey: { $regex: keyword, $options: "i" } },
    ];
  }

  const typeFilter = (body.spaceType || "").trim();
  if (typeFilter && typeFilter !== "all") {
    match.spaceType = typeFilter;
  }

  return match;
};

const projectMatchById = (req, recordId, { allowArchived = false } = {}) => ({
  ...orgMatch(req, { allowArchived }),
  _id: toObjectId(recordId),
});

const activeProjectMatch = (req, recordId) => ({
  _id: toObjectId(recordId),
  active: true,
  ...(UtilController.isEmpty(req.session.organizationId)
    ? {}
    : { organizationId: toObjectId(req.session.organizationId) }),
});

const leadLookupStages = [
  { $lookup: { from: "users", localField: "lead", foreignField: "_id", as: "mu" } },
  { $unwind: { path: "$mu", preserveNullAndEmptyArrays: true } },
  {
    $addFields: {
      managerFname: "$mu.fname",
      managerLname: "$mu.lname",
      managerProfileImage: "$mu.profileImage",
      managerName: {
        $trim: { input: { $concat: [{ $ifNull: ["$mu.fname", ""] }, " ", { $ifNull: ["$mu.lname", ""] }] } },
      },
    },
  },
  { $project: { mu: 0 } },
];

const parsePagination = (body) => ({
  page: UtilController.isEmpty(body.page) ? 0 : Number(body.page),
  pageSize: UtilController.isEmpty(body.pageSize) ? 10 : Number(body.pageSize),
});

const parseSort = (body) => {
  if (!UtilController.isEmpty(body.sortField) && !UtilController.isEmpty(body.sortOrder)) {
    const dir = body.sortOrder === "false" || body.sortOrder === false ? -1 : 1;
    return { [body.sortField]: dir };
  }
  return { updatedAt: -1 };
};

const normalizeProjectKey = (raw) =>
  String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const sendValidationError = (req, res, next, message) =>
  UtilController.sendError(req, res, next, {
    message,
    responseCode: returnCode.incompleteBody,
  });

const sendNotFound = (req, res, next, message = "Record not found") =>
  UtilController.sendError(req, res, next, {
    message,
    responseCode: returnCode.recordNotFound,
  });

const requireOrganization = (req, res, next) => {
  if (UtilController.isEmpty(req.session.organizationId)) {
    sendValidationError(req, res, next, "Organization Id is required");
    return false;
  }
  return true;
};

const touchMeta = (req) => ({
  updatedAt: nowTs(),
  operatedBy: req.session.userId,
});

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Next issue key for a space (e.g. PR-4), including inactive rows so numbers never collide. */
const nextSpaceIssueKey = async (mainProjectId, projectKey) => {
  const prefix = `${normalizeProjectKey(projectKey)}-`;
  const rows = await SpaceIssue.find({ mainProjectId: toObjectId(mainProjectId) }).select("issueKey").lean();
  let max = 0;
  const re = new RegExp(`^${escapeRegex(prefix)}(\\d+)$`, "i");
  for (const row of rows) {
    const match = String(row.issueKey || "").match(re);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return `${prefix}${max + 1}`;
};

/** Parse YYYY-MM-DD or unix seconds to start-of-day unix timestamp (seconds). */
const parseOptionalDate = (value) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return Math.floor(value);
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  const d = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor(d.getTime() / 1000);
};

module.exports = {
  nowTs,
  toObjectId,
  recordIdFrom,
  orgMatch,
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
  parseOptionalDate,
  returnCode,
};
