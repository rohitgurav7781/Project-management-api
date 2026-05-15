let request = require("request");
let mongoose = require("mongoose");

const ExpenseClaim = require("../../models/ExpenseClaim");
const Notification = require("../../models/Notification");
const User = require("../../models/User");

const { parsePhoneNumberFromString } = require("libphonenumber-js");
const UtilController = require("../services/UtilController");
const returnCode = require("../../../config/responseCode").returnCode;

const formatDate = value => {
  if (!value) return "";

  const date = typeof value === "number" && value.toString().length <= 10 ? new Date(value * 1000) : new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatAmount = amount => {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return amount || "0";

  return `₹${numericAmount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const notifyManagersOfExpenseClaim = async (claim, organizationId) => {
  try {
    const { managerId, employeeId, employeeName, expenseTitle, amount, category, expenseDate } = claim;
    const managerIds = Array.isArray(managerId) ? managerId : [managerId];

    if (!managerIds?.length) return;

    const employee = await User.findById(employeeId).lean();
    const employeeFullName = `${employee?.fname || ""} ${employee?.lname || ""}`.trim() || employeeName;

    const formattedDate = formatDate(expenseDate);
    const formattedAmount = formatAmount(amount);

    await Promise.all(
      managerIds.filter(Boolean).map(async mgrId => {
        const manager = await User.findById(mgrId).lean();
        if (!manager) return;

        await Notification.create({
          userId: mgrId,
          senderId: employeeId,
          title: `Expense Claim from ${employeeFullName}`,
          body: `${employeeFullName} submitted “${expenseTitle}” for ${
            category || "expense"
          } on ${formattedDate}. Amount: ${formattedAmount}.`,
          type: "system",
          read: false,
          visibleOnHome: true,
          actionUrl: "/expense-claims",
          recordId: claim._id,
          userType: manager.userType?.toLowerCase() || "manager",
          organizationId,
        });
      }),
    );
  } catch (err) {
    console.error("notifyManagersOfExpenseClaim error:", err);
  }
};

const notifyEmployeeOfStatusChange = async ({ claim, performerId, status, reason, performerRole = "manager" }) => {
  try {
    if (!claim?.employeeId || !performerId || !status) return;

    const employee = await User.findById(claim.employeeId).lean();
    const performer = await User.findById(performerId).lean();

    const employeeUserType = employee?.userType?.toLowerCase() || "employee";
    const performerName =
      `${performer?.fname || ""} ${performer?.lname || ""}`.trim() || (performerRole === "admin" ? "Admin" : "Manager");

    const summary = `“${claim.expenseTitle}” (${formatAmount(claim.amount)} • ${formatDate(claim.expenseDate)})`;

    let title = "";
    let body = "";

    switch (status) {
      case "Manager Approved":
        title = "Expense Claim Manager Approved";
        body = `${summary} was approved by ${performerName}. Awaiting admin review.`;
        break;
      case "Manager Rejected":
        title = "Expense Claim Manager Rejected";
        body = `${summary} was rejected by ${performerName}. Reason: ${reason || "N/A"}.`;
        break;
      case "Approved":
        title = "Expense Claim Approved";
        body = `${summary} was approved by admin.`;
        break;
      case "Rejected":
        title = "Expense Claim Rejected";
        body = `${summary} was rejected by admin. Reason: ${reason || "N/A"}.`;
        break;
      default:
        return;
    }

    await Notification.create({
      userId: claim.employeeId,
      senderId: performerId,
      title,
      body,
      type: "system",
      read: false,
      visibleOnHome: true,
      actionUrl: "/expense-claims",
      recordId: claim._id,
      userType: employeeUserType,
      organizationId: claim.organizationId,
    });
  } catch (err) {
    console.error("notifyEmployeeOfStatusChange error:", err);
  }
};

module.exports = {
  createExpenseClaim: async (req, res) => {
    try {
      const {
        employeeName,
        employeeId,
        employeeCode,
        managerId,
        expenseTitle,
        categoryId,
        category,
        amount,
        expenseDate,
        description,
        attachment,
        position,
      } = req.body;

      if (UtilController.isEmpty(req.session.organizationId)) throw { message: "Organization Id is required" };

      const newExpenseClaim = new ExpenseClaim({
        organizationId: req.session.organizationId,
        employeeName,
        employeeId,
        employeeCode,
        managerId,
        expenseTitle,
        categoryId,
        category,
        amount,
        expenseDate,
        description,
        attachment,
        status: "Pending",
        managerStatus: "Pending",
        createdBy: null,
        position,
      });

      const savedExpenseClaim = await newExpenseClaim.save();

      await notifyManagersOfExpenseClaim(savedExpenseClaim, req.session.organizationId);

      res.status(201).json({
        message: "Expense Claim created successfully",
        data: savedExpenseClaim,
      });
    } catch (error) {
      res.status(500).json({
        message: "Error creating Expense Claim",
        error: error.message,
      });
    }
  },

  deleteExpenseClaim: async (req, res, next) => {
    try {
      let expenseClaimId = req.body.recordId;

      await ExpenseClaim.updateMany(
        { _id: { $in: expenseClaimId } },
        {
          $set: {
            active: false,
            updatedAt: Math.floor(Date.now() / 1000),
          },
        },
        { new: true },
      );

      UtilController.sendSuccess(req, res, next, {
        message: "Expense Claim deleted successfully",
      });
    } catch (error) {
      UtilController.sendError(req, res, next, error);
    }
  },

  getExpenseClaimById: async (req, res, next) => {
    try {
      const recordId = req.body.recordId;
      let organizationId;

      if (!req.session.isSuperAdmin) {
        organizationId = req.session.organizationId;
      }

      if (!recordId) {
        return UtilController.sendError(req, res, next, {
          message: "Invalid Expense Claim id",
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
          $lookup: {
            from: "users",
            localField: "managerId",
            foreignField: "_id",
            as: "managerDetails",
          },
        },
        {
          $lookup: {
            from: "expense_categories",
            localField: "categoryId",
            foreignField: "_id",
            as: "categoryDetails",
          },
        },
        {
          $unwind: {
            path: "$categoryDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 1,
            employeeName: 1,
            employeeId: 1,
            employeeCode: 1,
            managerId: 1,
            expenseTitle: 1,
            categoryId: 1,
            category: 1,
            amount: 1,
            expenseDate: 1,
            description: 1,
            attachment: 1,
            status: 1,
            managerStatus: 1,
            rejectedReason: 1,
            managerRejectedReason: 1,
            createdAt: 1,
            updatedAt: 1,
            organization: {
              name: "$organization.organizationName",
              _id: "$organization._id",
            },
            managerDetails: {
              $map: {
                input: "$managerDetails",
                as: "m",
                in: {
                  _id: "$$m._id",
                  fname: "$$m.fname",
                  lname: "$$m.lname",
                  fullName: {
                    $concat: [{ $ifNull: ["$$m.fname", ""] }, " ", { $ifNull: ["$$m.lname", ""] }],
                  },
                  profileImage: "$$m.profileImage",
                },
              },
            },
            categoryDetails: {
              _id: "$categoryDetails._id",
              name: "$categoryDetails.name",
            },
            approvedDate: 1,
            managerApprovedDate: 1,
          },
        },
      ];

      const [result] = await ExpenseClaim.aggregate(pipeline);

      return UtilController.sendSuccess(req, res, next, {
        data: result,
      });
    } catch (error) {
      return UtilController.sendError(req, res, next, error);
    }
  },

  updateExpenseClaim: async (req, res, next) => {
    try {
      const updateObj = req.body;

      if (!updateObj.expenseClaimId) {
        return UtilController.sendError(req, res, next, {
          responseCode: returnCode.incompleteBody,
          message: "expenseClaimId is required.",
        });
      }

      const expenseClaim = await ExpenseClaim.findById(updateObj.expenseClaimId);

      if (!expenseClaim) {
        return UtilController.sendError(req, res, next, {
          responseCode: returnCode.recordNotFound,
          message: "Expense claim not found.",
        });
      }

      const userId = req.session.userId;
      const userType = req.session.userType;

      const managerIds = Array.isArray(expenseClaim.managerId)
        ? expenseClaim.managerId.map(id => id.toString())
        : [expenseClaim.managerId.toString()];

      const isManager = managerIds.includes(userId.toString());
      const isAdmin = userType === "Admin";

      const notificationsToSend = [];

      if (updateObj.status === "Manager Approved" || updateObj.managerStatus === "Manager Approved") {
        if (!isManager) {
          return UtilController.sendError(req, res, next, {
            message: "You are not authorized to approve this expense claim as a manager.",
          });
        }

        updateObj.managerStatus = "Manager Approved";
        updateObj.managerApprovedBy = userId;
        updateObj.managerApprovedAt = Math.floor(Date.now() / 1000);

        delete updateObj.status;

        notificationsToSend.push({
          status: "Manager Approved",
          performerRole: "manager",
        });
      }

      if (updateObj.managerStatus === "Manager Rejected") {
        if (!isManager) {
          return UtilController.sendError(req, res, next, {
            message: "You are not authorized to reject this expense claim as a manager.",
          });
        }

        if (!updateObj.managerRejectedReason || updateObj.managerRejectedReason.trim() === "") {
          return UtilController.sendError(req, res, next, {
            message: "Rejection reason is required when rejecting an expense claim.",
          });
        }

        updateObj.managerStatus = "Manager Rejected";
        updateObj.status = "Rejected";
        updateObj.managerRejectedBy = userId;
        updateObj.managerRejectedAt = Math.floor(Date.now() / 1000);

        notificationsToSend.push({
          status: "Manager Rejected",
          performerRole: "manager",
          reason: updateObj.managerRejectedReason,
        });
      }

      if (updateObj.status === "Approved") {
        if (!isAdmin) {
          return UtilController.sendError(req, res, next, {
            message: "Only Admins are authorized to give final approval.",
          });
        }

        if (expenseClaim.managerStatus !== "Manager Approved") {
          return UtilController.sendError(req, res, next, {
            message: "Manager approval is required before Admin can approve.",
          });
        }

        updateObj.approvedBy = userId;
        updateObj.approvedAt = Math.floor(Date.now() / 1000);

        notificationsToSend.push({
          status: "Approved",
          performerRole: "admin",
        });
      }

      if (updateObj.status === "Rejected" && isAdmin) {
        if (!updateObj.rejectedReason || updateObj.rejectedReason.trim() === "") {
          return UtilController.sendError(req, res, next, {
            message: "Rejection reason is required when rejecting an expense claim.",
          });
        }

        updateObj.rejectedBy = userId;
        updateObj.rejectedAt = Math.floor(Date.now() / 1000);

        notificationsToSend.push({
          status: "Rejected",
          performerRole: "admin",
          reason: updateObj.rejectedReason,
        });
      }

      updateObj.operatedBy = userId;
      updateObj.updatedAt = Math.floor(Date.now() / 1000);

      const updatedExpenseClaim = await ExpenseClaim.findByIdAndUpdate(updateObj.expenseClaimId, updateObj, {
        new: true,
      });

      await Promise.all(
        notificationsToSend.map(payload =>
          notifyEmployeeOfStatusChange({
            claim: updatedExpenseClaim,
            performerId: userId,
            status: payload.status,
            reason: payload.reason,
            performerRole: payload.performerRole,
          }),
        ),
      );

      UtilController.sendSuccess(req, res, next, {
        message: `Expense claim ${updateObj.status ? updateObj.status.toLowerCase() : "updated"} successfully.`,
        expenseClaim: updatedExpenseClaim,
        responseCode: returnCode.validSession,
      });
    } catch (error) {
      console.error("Error updating expense claim:", error);
      UtilController.sendError(req, res, next, {
        message: "An error occurred while updating the expense claim.",
        error: error.message,
        responseCode: returnCode.error,
      });
    }
  },

  listExpenseClaim: async (req, res, next) => {
    try {
      let search = {};
      let userId = req.session.userId;
      let userType = req.session.userType;

      if (!UtilController.isEmpty(req.body.keyword)) {
        search["$or"] = [
          { employeeName: { $regex: req.body.keyword, $options: "i" } },
          { expenseTitle: { $regex: req.body.keyword, $options: "i" } },
        ];
      }

      let match = { active: true };

      if (!UtilController.isEmpty(req.session.organizationId)) {
        match["organizationId"] = mongoose.Types.ObjectId(req.session.organizationId);
      }

      if (userType !== "Admin") {
        match["$or"] = [
          { employeeId: mongoose.Types.ObjectId(userId) },
          { managerId: mongoose.Types.ObjectId(userId) },
          { managerId: { $in: [mongoose.Types.ObjectId(userId)] } },
        ];
      }

      if (!UtilController.isEmpty(req.body.active)) match["active"] = req.body.active;

      if (!UtilController.isEmpty(req.body.category)) {
        match["category"] = req.body.category;
      }

      if (!UtilController.isEmpty(req.body.categoryId)) {
        match["categoryId"] = mongoose.Types.ObjectId(req.body.categoryId);
      }

      if (!UtilController.isEmpty(req.body.amount)) {
        match["amount"] = Number(req.body.amount);
      }

      if (!UtilController.isEmpty(req.body.minAmount) || !UtilController.isEmpty(req.body.maxAmount)) {
        match["amount"] = {};
        if (req.body.minAmount) match.amount.$gte = Number(req.body.minAmount);
        if (req.body.maxAmount) match.amount.$lte = Number(req.body.maxAmount);
      }

      let sort = {};

      if (!UtilController.isEmpty(req.body.sortField) && !UtilController.isEmpty(req.body.sortOrder)) {
        let sortField = req.body.sortField;
        let sortOrder = req.body.sortOrder;
        sort[sortField] = sortOrder;
      } else {
        sort = { updatedAt: -1 };
      }

      let pageSize = req.body.pageSize || 10;
      let page = req.body.page || 0;

      const project = await ExpenseClaim.aggregate([
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
        {
          $lookup: {
            from: "expense_categories",
            localField: "categoryId",
            foreignField: "_id",
            as: "expense_category",
          },
        },
        {
          $unwind: {
            path: "$expense_category",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "managerId",
            foreignField: "_id",
            as: "managerDetails",
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "employeeId",
            foreignField: "_id",
            as: "employeeDetails",
          },
        },
        {
          $unwind: {
            path: "$employeeDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        { $match: search },
        {
          $facet: {
            totalCount: [{ $count: "count" }],
            data: [
              { $sort: sort },
              { $skip: page * pageSize },
              { $limit: pageSize },
              {
                $project: {
                  _id: 1,
                  employeeName: 1,
                  employeeId: 1,
                  employeeCode: 1,
                  employeeProfileImage: "$employeeDetails.profileImage",
                  managerId: 1,
                  managerDetails: {
                    _id: 1,
                    fname: 1,
                    lname: 1,
                    email: 1,
                  },
                  position: 1,
                  expenseTitle: 1,
                  categoryId: 1,
                  category: 1,
                  amount: 1,
                  expenseDate: 1,
                  description: 1,
                  attachment: 1,
                  status: 1,
                  managerStatus: 1,
                  rejectedReason: 1,
                  managerRejectedReason: 1,
                  rejectedBy: 1,
                  rejectedAt: 1,
                  managerRejectedBy: 1,
                  managerRejectedAt: 1,
                  approvedBy: 1,
                  approvedAt: 1,
                  managerApprovedBy: 1,
                  managerApprovedAt: 1,
                  createdAt: 1,
                  updatedAt: 1,
                  organization: "$organization.organizationName",
                  expense_category: "$expense_category.name",
                },
              },
            ],
          },
        },
      ]);

      const totalCount = project?.[0].totalCount?.[0]?.count || 0;
      const rows = project?.[0]?.data || [];
      const pages = Math.ceil(totalCount / pageSize);

      UtilController.sendSuccess(req, res, next, {
        rows,
        filterRecords: totalCount,
        pages,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
};
