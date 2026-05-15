const mongoose = require("mongoose");
const LeaveRequest = require("../../../models/LeaveRequest");
const User = require("../../../models/User");
const Activity = require("../../../models/Activity");
const Project = require("../../../models/Project");
const Timesheet = require("../../../models/Timesheet");
const WorkAllocation = require("../../../models/WorkAllocations");
const Customer = require("../../../models/Cor");
const Department = require("../../../models/Department");
const Feedback = require("../../../models/FeedBack");
const Event = require("../../../models/Event");
const Organization = require("../../../models/Organizations");
const Policy = require("../../../models/Policy");
const Announcement = require("../../../models/Announcements");
const ExpenseClaim = require("../../../models/ExpenseClaim");
const Invoice = require("../../../models/Invoice");
const Payment = require("../../../models/Payment");
const PO = require("../../../models/Po");
const COR = require("../../../models/Cor");

function getLocalDayRangeEpochSeconds(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return {
    startSec: Math.floor(start.getTime() / 1000),
    endSec: Math.floor(end.getTime() / 1000),
    label: start.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
  };
}

function looksLikeAskingForToday(q) {
  return /\b(today|todays|today's|current day|right now|this moment|for today)\b/.test(q);
}

function epochToReadable(epochSeconds) {
  if (!epochSeconds) return null;
  return new Date(epochSeconds * 1000).toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ── UC-01: Leave Requests ────────────────────────────────
async function UC01_leaveRequests(q, { orgId, userId, userType }) {
  if (!/leave|off|absent|vacation|holiday|time[\s-]?off|break request/.test(q)) return {};

  let match = { organizationId: orgId, active: true };
  if (userType === "Employee") {
    match["$or"] = [{ employeeId: userId }, { managerId: userId }];
  }

  const baseSelect = "employeeName leaveType startDate endDate totalDays status reason -_id";
  const data = {};

  if (looksLikeAskingForToday(q)) {
    const { startSec, endSec, label } = getLocalDayRangeEpochSeconds(new Date());
    const todaysApproved = await LeaveRequest.find({
      ...match,
      status: "Approved",
      startDate: { $lte: endSec },
      endDate: { $gte: startSec },
    })
      .select(baseSelect)
      .lean();

    data.leave_today = {
      date: label,
      startEpochSec: startSec,
      endEpochSec: endSec,
      approvedLeaves: todaysApproved.map(l => ({
        ...l,
        startDate: epochToReadable(l.startDate),
        endDate: epochToReadable(l.endDate),
      })),
      count: todaysApproved.length,
    };
  }

  const allLeaves = await LeaveRequest.find(match).select(baseSelect).lean();
  data.leave_requests = allLeaves.map(l => ({
    ...l,
    startDate: epochToReadable(l.startDate),
    endDate: epochToReadable(l.endDate),
  }));
  return data;
}

// ── UC-02: Projects ──────────────────────────────────────
async function UC02_projects(q, { orgId }) {
  if (!/project|my project|tell me.*project|project.*status|deadline|milestone|timeline|sprint/.test(q)) return {};

  const projects = await Project.find({ organizationId: orgId, active: true })
    .select(
      "projectName projectTagId projectNumber projectStatus startDate endDate team projectHead customerId note -_id",
    )
    .populate("customerId", "companyName city country -_id")
    .populate("team", "fname lname employeeId -_id")
    .populate("projectHead", "fname lname employeeId -_id")
    .lean();

  return {
    projects: projects.map(p => ({
      ...p,
      startDate: epochToReadable(p.startDate),
      endDate: epochToReadable(p.endDate),
    })),
    project_count: projects.length,
    project_summary: {
      total: projects.length,
      open: projects.filter(p => p.projectStatus === "open").length,
      on_hold: projects.filter(p => p.projectStatus === "on_hold").length,
      completed: projects.filter(p => p.projectStatus === "completed").length,
      allocated: projects.filter(p => p.projectStatus === "allocated").length,
      archived: projects.filter(p => p.projectStatus === "archived").length,
    },
  };
}

// ── UC-03: Work Allocations / Tasks ─────────────────────
async function UC03_workAllocations(q, { orgId, userId, userType }) {
  if (
    !/task|allocat|assign|overdue|work order|my work|pending work|what about|tell me about|work assigned|allocation of|same of|work/.test(
      q,
    )
  )
    return {};

  let taskMatch = { organizationId: orgId, active: true };
  if (userType === "Employee") taskMatch.employeeId = userId;

  const isToday = looksLikeAskingForToday(q);
  if (isToday) {
    const { startSec, endSec } = getLocalDayRangeEpochSeconds(new Date());

    taskMatch.startDateTime = { $lte: endSec };
    taskMatch.endDateTime = { $gte: startSec };
  }

  const work_allocations = await WorkAllocation.find(taskMatch)
    .select(
      "tagId activityName status priority duration durationRequired startDateTime endDateTime domainNames workDescription projectId employeeId managerId -_id",
    )
    .populate("projectId", "projectName -_id")
    .populate("employeeId", "fname lname -_id")
    .lean();

  return {
    work_allocations: work_allocations.map(w => ({
      ...w,
      startDateTime: epochToReadable(w.startDateTime),
      endDateTime: epochToReadable(w.endDateTime),
    })),
    // FIX 4: Tell the AI explicitly whether this is filtered for today
    work_allocation_filter: isToday ? "today only" : "all",
    work_allocation_count: work_allocations.length,
  };
}

// ── UC-04: Timesheets ────────────────────────────────────
async function UC04_timesheets(q, { orgId, userId, userType }) {
  if (
    !/timesheet|my timesheet|how many timesheet|how much timesheet|timesheets i have|logged|time[\s-]?spent|attendance|duration/.test(
      q,
    )
  )
    return {};

  let tsMatch = { organizationId: orgId, active: true };
  if (userType === "Employee") tsMatch.employeeId = userId;

  const timesheets = await Timesheet.find(tsMatch)
    .select(
      "tagId activityName subActivityName status duration durationRequired startDateTime endDateTime projectId employeeId workDescription priority -_id",
    )
    .populate("projectId", "projectName -_id")
    .populate("employeeId", "fname lname employeeId -_id")
    .lean();

  return {
    timesheets: timesheets.map(t => ({
      ...t,
      startDateTime: epochToReadable(t.startDateTime),
      endDateTime: epochToReadable(t.endDateTime),
    })),
    timesheet_count: timesheets.length,
    timesheet_summary: {
      total: timesheets.length,
      approved: timesheets.filter(t => t.status === "approved").length,
      pending: timesheets.filter(t => t.status === "pending").length,
      rejected: timesheets.filter(t => t.status === "rejected").length,
    },
  };
}

// ── UC-05: Team Members / Employees ─────────────────────
async function UC05_teamMembers(q, { orgId }) {
  if (
    !/team|member|who is|staff|employee|head|manager|colleague|personnel|tell me about|details of|info about|profile of/.test(
      q,
    )
  )
    return {};

  const team_members = await User.find({ organizationId: orgId, active: true })
    .select(
      "fname lname employeeId userType department position status gender totalExp reportingManagerName isDepartmentHead departmentId -_id",
    )
    .lean();

  return { team_members };
}

// ── UC-06: Activities ────────────────────────────────────
async function UC06_activities(q, { orgId }) {
  if (!/activit|task list|in[\s-]?progress|backlog|sub[\s-]?activit/.test(q)) return {};

  const activities = await Activity.find({ organizationId: orgId, active: true })
    .select("name domain isParent parentActivity active createdAt -_id")
    .lean();

  return { activities };
}

// ── UC-07: Departments ───────────────────────────────────
async function UC07_departments(q, { orgId }) {
  if (!/department|division|dept/.test(q)) return {};

  const departments = await Department.find({ organizationId: orgId, active: true })
    .select("departmentId name description location phone head -_id")
    .lean();

  return { departments };
}

// ── UC-08: Customers / Clients ───────────────────────────
async function UC08_customers(q, { orgId }) {
  if (!/customer|client|vendor|partner/.test(q)) return {};

  const customers = await Customer.find({ organizationId: orgId, active: true })
    .select("customerTagId companyName email city state country contactPerson -_id")
    .lean();

  return { customers };
}

// ── UC-09: Feedback / Performance ───────────────────────
async function UC09_feedback(q, { orgId, userId, userType }) {
  if (!/feedback|review|rating|performance|apprais|appreciation|appr/.test(q)) return {};

  let feedbackMatch = { organizationId: orgId, active: true };
  if (userType === "Employee") feedbackMatch.employeeId = userId;

  const feedbacks = await Feedback.find(feedbackMatch)
    .select("employeeId managerId feedbackType ratings averageRating date -_id")
    .lean();

  return { feedbacks };
}

// ── UC-10: Events ────────────────────────────────────────
async function UC10_events(q, { orgId }) {
  if (!/event|meeting|gathering|tournament|schedule|calendar/.test(q)) return {};

  const events = await Event.find({ organizationId: orgId, active: true })
    .select("title description status startDateTime endDateTime -_id")
    .lean();

  return {
    events: events.map(e => ({
      ...e,
      startDateTime: epochToReadable(e.startDateTime),
      endDateTime: epochToReadable(e.endDateTime),
    })),
    event_count: events.length,
  };
}

// ── UC-11: Organization Info ─────────────────────────────
async function UC11_organization(q, { orgId }) {
  if (!/organiz|organis|org info|branch|about us|office/.test(q)) return {};

  const organization = await Organization.findById(orgId)
    .select(
      "organizationName branchName organizationAddress city state country organizationPhone organizationEmail employeePrefix -_id",
    )
    .lean();

  return { organization };
}

// ── UC-12: Policies ──────────────────────────────────────
async function UC12_policies(q, { orgId }) {
  if (!/policy|policies|rule|guideline|compliance/.test(q)) return {};

  const policies = await Policy.find({ organizationId: orgId, active: true }).select("name description -_id").lean();

  return { policies, policy_count: policies.length };
}

// ── UC-13: Announcements ─────────────────────────────────
async function UC13_announcements(q, { orgId }) {
  if (!/announc|ann|notice|bulletin|news|update/.test(q)) return {};

  const announcements = await Announcement.find({ organizationId: orgId, active: true })
    .select("title description priority expirationDate -_id")
    .lean();

  return {
    announcements: announcements.map(a => ({
      ...a,
      expirationDate: a.expirationDate
        ? epochToReadable(a.expirationDate > 9999999999 ? Math.floor(a.expirationDate / 1000) : a.expirationDate)
        : null,
    })),
    announcement_count: announcements.length,
  };
}

// ── UC-14: Pending Timesheet Approvals (Manager) ─────────
async function UC14_pendingTimesheetApprovals(q, { orgId, userId, userType }) {
  if (!/pending|approval|approve|waiting|review/.test(q)) return {};
  if (userType === "Employee") return {};

  const timesheets = await Timesheet.find({
    organizationId: orgId,
    managerId: userId,
    status: "pending",
    active: true,
  })
    .select("tagId activityName status priority startDateTime endDateTime projectId employeeId workDescription -_id")
    .populate("projectId", "projectName -_id")
    .populate("employeeId", "fname lname employeeId -_id")
    .lean();

  return {
    pending_timesheet_approvals: timesheets.map(t => ({
      ...t,
      startDateTime: epochToReadable(t.startDateTime),
      endDateTime: epochToReadable(t.endDateTime),
    })),
    pending_timesheet_count: timesheets.length,
  };
}

// ── UC-15: Pending Leave Approvals (Manager) ─────────────
async function UC15_pendingLeaveApprovals(q, { orgId, userId, userType }) {
  if (!/pending|approval|approve|waiting|review|leave/.test(q)) return {};
  if (userType === "Employee") return {};

  const leaves = await LeaveRequest.find({
    organizationId: orgId,
    managerId: userId,
    status: "Pending",
    active: true,
  })
    .select("employeeName leaveType startDate endDate totalDays status reason -_id")
    .lean();

  return {
    pending_leave_approvals: leaves.map(l => ({
      ...l,
      startDate: epochToReadable(l.startDate),
      endDate: epochToReadable(l.endDate),
    })),
    pending_leave_count: leaves.length,
  };
}

// ── UC-16: Pending Expense Claim Approvals (Manager) ─────
async function UC16_pendingExpenseApprovals(q, { orgId, userId, userType }) {
  if (!/pending|approval|approve|waiting|review|expense/.test(q)) return {};
  if (userType === "Employee") return {};

  const expenses = await ExpenseClaim.find({
    organizationId: orgId,
    managerId: userId,
    managerStatus: "Pending",
    active: true,
  })
    .select(
      "employeeName employeeCode position expenseTitle category expenseDate description status managerStatus -_id",
    )
    .lean();

  return {
    pending_expense_approvals: expenses.map(e => ({
      ...e,
      expenseDate: epochToReadable(e.expenseDate),
    })),
    pending_expense_count: expenses.length,
  };
}

// ── UC-17: Resource Allocation Summary ───────────────────
async function UC17_resourceAllocation(q, { orgId, userId, userType }) {
  if (!/resource|allocation|calendar|idle|partially|who is (free|available|busy|allocated)|utiliz/.test(q)) return {};

  const { startSec, endSec, label } = getLocalDayRangeEpochSeconds(new Date());

  const allocations = await WorkAllocation.find({
    organizationId: orgId,
    active: true,
    startDateTime: { $lte: endSec },
    endDateTime: { $gte: startSec },
  })
    .select("employeeId projectId activityName duration startDateTime endDateTime -_id")
    .populate("employeeId", "fname lname position userType -_id")
    .populate("projectId", "projectName -_id")
    .lean();

  const onLeave = await LeaveRequest.find({
    organizationId: orgId,
    active: true,
    status: "Approved",
    startDate: { $lte: endSec },
    endDate: { $gte: startSec },
  })
    .select("employeeName leaveType -_id")
    .lean();

  return {
    resource_allocation_today: {
      date: label,
      allocated_count: allocations.length,
      on_leave_count: onLeave.length,
      allocations: allocations.map(a => ({
        employee: a.employeeId,
        project: a.projectId?.projectName || "",
        activityName: a.activityName,
        duration: a.duration,
        startDateTime: epochToReadable(a.startDateTime),
        endDateTime: epochToReadable(a.endDateTime),
      })),
      on_leave: onLeave,
    },
  };
}

// ── UC-18: Invoices (Admin only) ─────────────────────────
async function UC18_invoices(q, { orgId, userType }) {
  if (!/invoice|billing|bill|invoices/.test(q)) return {};

  if (userType === "Employee") return {};

  const invoices = await Invoice.find({ organizationId: orgId, active: true })
    .select(
      "invoiceNumber customerName projectName status poNumber poAmount balanceAmount subtotal totalAmount gstHst gstHstPercent currency currencySymbol createdAt -_id",
    )
    .lean();

  return {
    invoices: invoices.map(i => ({
      ...i,
      createdAt: epochToReadable(i.createdAt),
    })),
    invoice_count: invoices.length,
    invoice_summary: {
      total: invoices.length,
      pending: invoices.filter(i => i.status === "Pending").length,
      paid: invoices.filter(i => i.status === "Paid").length,
      overdue: invoices.filter(i => i.status === "Overdue").length,
    },
  };
}

// ── UC-19: Payments (Admin only) ─────────────────────────
async function UC19_payments(q, { orgId, userType }) {
  if (!/payment|payments|transaction|received amount|cheque/.test(q)) return {};
  if (userType === "Employee") return {};

  let match = { organizationId: orgId, active: true };

  const isToday = looksLikeAskingForToday(q);
  if (isToday) {
    const { startSec, endSec } = getLocalDayRangeEpochSeconds(new Date());
    match.transactionDate = { $lte: endSec, $gte: startSec };
  }

  const payments = await Payment.find(match)
    .select(
      "paymentNumber customerName projectName invoiceNumber invoiceAmount receivedAmount balanceAmount status paymentMode bankName chequeNumber refNumber invoiceDate chequeDate transactionDate -_id",
    )
    .lean();

  return {
    payments: payments.map(p => ({
      ...p,
      invoiceDate: epochToReadable(p.invoiceDate),
      chequeDate: epochToReadable(p.chequeDate),
      transactionDate: epochToReadable(p.transactionDate),
    })),
    payment_count: payments.length,
    payment_filter: isToday ? "today only" : "all",
    payment_summary: {
      total: payments.length,
      draft: payments.filter(p => p.status === "Draft").length,
      approved: payments.filter(p => p.status === "Approved").length,
      completed: payments.filter(p => p.status === "Completed").length,
      pending: payments.filter(p => p.status === "Pending").length,
      rejected: payments.filter(p => p.status === "Rejected").length,
    },
  };
}

// ── UC-20: Purchase Orders (Admin only) ──────────────────
async function UC20_purchaseOrders(q, { orgId, userType }) {
  if (!/\bpo\b|purchase order|purchase orders/.test(q)) return {};
  if (userType === "Employee") return {};

  const pos = await PO.find({ organizationId: orgId, active: true })
    .select(
      "poNumber customerName projectName quoteNumber status jobNumber clientPoNumber detailingAmount designAmount designVendor cToUsica cToClient progress poDate note -_id",
    )
    .populate("team", "fname lname -_id")
    .lean();

  return {
    purchase_orders: pos.map(p => ({
      ...p,
      poDate: epochToReadable(p.poDate),
    })),
    po_count: pos.length,
    po_summary: {
      total: pos.length,
      open: pos.filter(p => p.status === "open").length,
      allocated: pos.filter(p => p.status === "allocated").length,
      completed: pos.filter(p => p.status === "completed").length,
      pending: pos.filter(p => p.status === "pending").length,
      on_hold: pos.filter(p => p.status === "on_hold").length,
      approved: pos.filter(p => p.status === "approved").length,
      rejected: pos.filter(p => p.status === "rejected").length,
      archived: pos.filter(p => p.status === "archived").length,
    },
  };
}

// ── UC-21: CORs / Change Order Requests (Admin only) ─────
async function UC21_cors(q, { orgId, userType }) {
  if (!/\bcor\b|change order|cors/.test(q)) return {};
  if (userType === "Employee") return {};

  const cors = await COR.find({ organizationId: orgId, active: true })
    .select(
      "corNumber customerName projectName poNumber status corAmount revisedPOAmount progress coPo designedCor detailingCor corApprovedDate note -_id",
    )
    .lean();

  return {
    cors: cors.map(c => ({
      ...c,
      corApprovedDate: epochToReadable(c.corApprovedDate),
    })),
    cor_count: cors.length,
    cor_summary: {
      total: cors.length,
      open: cors.filter(c => c.status === "open").length,
      allocated: cors.filter(c => c.status === "allocated").length,
      completed: cors.filter(c => c.status === "completed").length,
      pending: cors.filter(c => c.status === "pending").length,
      approved: cors.filter(c => c.status === "approved").length,
      rejected: cors.filter(c => c.status === "rejected").length,
      archived: cors.filter(c => c.status === "archived").length,
    },
  };
}

async function fetchSafeData(question, organizationId, session) {
  const q = question.toLowerCase();
  const context = {
    orgId: mongoose.Types.ObjectId(organizationId),
    userId: mongoose.Types.ObjectId(session.userId),
    userType: session.userType,
  };

  const results = await Promise.all([
    UC01_leaveRequests(q, context),
    UC02_projects(q, context),
    UC03_workAllocations(q, context),
    UC04_timesheets(q, context),
    UC05_teamMembers(q, context),
    UC06_activities(q, context),
    UC07_departments(q, context),
    UC08_customers(q, context),
    UC09_feedback(q, context),
    UC10_events(q, context),
    UC11_organization(q, context),
    UC12_policies(q, context),
    UC13_announcements(q, context),
    UC14_pendingTimesheetApprovals(q, context),
    UC15_pendingLeaveApprovals(q, context),
    UC16_pendingExpenseApprovals(q, context),
    UC17_resourceAllocation(q, context),
    UC18_invoices(q, context),
    UC19_payments(q, context),
    UC20_purchaseOrders(q, context),
    UC21_cors(q, context),
  ]);

  return Object.assign({}, ...results);
}

module.exports = fetchSafeData;
