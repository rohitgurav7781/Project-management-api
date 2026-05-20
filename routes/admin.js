var express = require("express");
var router = express.Router();
const fs = require("fs");
const os = require("os");
const path = require("path");
const multer = require("multer");
const UserController = require("../api/controller/admin/UserController");
const RoleController = require("../api/controller/admin/RoleController");
const OptionsController = require("../api/controller/admin/OptionsController");
const DashboardController = require("../api/controller/admin/DashboardController");
const NotificationController = require("../api/controller/admin/NotificationController");
var cron = require("node-cron");
const BackupController = require("../api/controller/services/BackupController");
const UtilController = require("../api/controller/services/UtilController");
const customerController = require("../api/controller/admin/CustomerController");
const OrganizationController = require("../api/controller/admin/OrganizationController");
const ActivityController = require("../api/controller/admin/ActivityController");
const TimesheetController = require("../api/controller/admin/TimesheetAndAllocationController");
const DepartmentController = require("../api/controller/admin/DepartmentController");
const ProjectController = require("../api/controller/admin/ProjectController");
const FeedBack = require("../api/controller/admin/FeedBackController");
const WorkAllocation = require("../api/controller/admin/WorkAllocation");
const ResourceManagementController = require("../api/controller/admin/ResourceManagementController");
const EmailTemplateController = require("../api/controller/admin/EmailTemplateController");
const QuoteController = require("../api/controller/admin/QuoteController");
const PoController = require("../api/controller/admin/PoController");
const CorController = require("../api/controller/admin/CorController");
const InvoiceController = require("../api/controller/admin/InvoiceController");
const PaymentController = require("../api/controller/admin/PaymentController");
const PolicyController = require("../api/controller/admin/PolicyController");
const AnnouncementController = require("../api/controller/admin/AnnouncementController");
const EventController = require("../api/controller/admin/EventController");
const LeaveRequestController = require("../api/controller/admin/LeaveRequestController");
const ExpensesController = require("../api/controller/admin/ExpensesController");
const BirthDayWisheshController = require("../api/controller/admin/BirthDayWisheshController");
const ExpenseClaimController = require("../api/controller/admin/ExpenseClaimController");
const TeamsController = require("../api/controller/admin/TeamsController");
const GroupController = require("../api/controller/admin/GroupController");
const TicketController = require("../api/controller/admin/TicketController");
const ChatController = require("../api/controller/admin/ChatController");
const MainProjectController = require("../api/controller/admin/MainProjectController");
const upload = require("../api/middleware/upload");
const GroqAiController = require("../api/controller/admin/GroqAiController");

// Multer for endpoints that accept multipart/form-data (xlsx/csv uploads etc.)
const multipartTmpDir = path.join(os.tmpdir(), "spms-multipart-tmp");
if (!fs.existsSync(multipartTmpDir)) {
  fs.mkdirSync(multipartTmpDir, { recursive: true });
}
const multipartUpload = multer({ dest: multipartTmpDir });

function normalizeAttachmentFiles(req, _res, next) {
  // Normalize shape so controllers can use req.files.attachment
  if (Array.isArray(req.files)) {
    const attachmentFiles = req.files.filter(
      (file) => file.fieldname === "attachment",
    );
    if (attachmentFiles.length === 1) {
      req.files = { attachment: attachmentFiles[0] };
    } else if (attachmentFiles.length > 1) {
      req.files = { attachment: attachmentFiles };
    } else {
      req.files = {};
    }
  }
  next();
}

router.use(function (req, res, next) {
  //  console.log('Something is happening. in admin route');
  next();
});
// run mongodb backup cron job
let dbBackupTask = cron.schedule("59 23 * * *", () => {
  //'59 23 * * *
  console.log("mongodb backup scheduler is triggered");
  BackupController.mongodbBackup();
});

// general apis
router.route("/list/all/upload/file").put(UserController.listUploadedFiles);

router.route("/current/version").get(UtilController.appVersion); // This is to get the current version of app running
router.route("/update/version").post(UtilController.appVersionUpdate);

router.route("/islogin").get(UserController.accountLoginStatus);
router.route("/accountLogin").post(UserController.accountLogin);
router.route("/verify/otp").post(UserController.verifyOtp);
router.route("/resend/otp").post(UserController.resendOtp);
router.route("/logout").get(UserController.accountLogout);
router.route("/update/password").post(UserController.updatePassword);
router.route("/password/generate").get(UserController.generatePassword);
router.route("/forgot/password/otp").post(UserController.forgotPasswordOtp);

// Role creation and granting permission to employee
router.route("/roles/all").post(RoleController.queryRole);
router.route("/roles/titles").get(RoleController.queryTitle);
router.route("/role/details").post(RoleController.getRoleInfoById); // this is to get complete details particular role.
router.route("/role/create").post(RoleController.createRole);
router.route("/role/delete").post(RoleController.deleteRole);
router.route("/role/permission/update").put(RoleController.updateRolePermission);
router.route("/role/permission/grant").put(RoleController.grantRole);
router.route("/role/permission/unassigned").post(RoleController.getUnassigned);
router.route("/role/createdby/dropdown").get(RoleController.queryCreatedByUsers);
router.route("/role/configuration/all").get(RoleController.rolesConfigureList);
router.route("/role/dropdown/list").post(RoleController.rolesDropdown);

// role persmission  dashborad api
router.route("/role/permission/dashboard").get(RoleController.rolePermissionDashboard);
router.route("/role/get/permission").get(RoleController.getRolePermission);

// ticket api
router.route("/ticket/create").post(TicketController.createTicket);
router.route("/ticket/list").post(TicketController.listTicket);
router.route("/ticket/update").post(TicketController.updateTicket);
router.route("/ticket/details").post(TicketController.getTicketById);
router.route("/ticket/count").get(TicketController.getTicketCount);

// quates api
router.route("/quotes/create").post(QuoteController.createQuote);
router.route("/quotes/list").post(QuoteController.listQuotes);
router.route("/quotes/duplicate").put(QuoteController.duplicateQuote);
router.route("/quotes/delete").post(QuoteController.deleteQuotes);
router.route("/quotes/update").post(QuoteController.updateQuote);
router.route("/quotes/details").post(QuoteController.getQuoteById);
router.route("/quotes").get(QuoteController.quotes);
router.route("/quoteEstimate/create").post(QuoteController.createQuoteEstimate);
router.route("/quoteEstimate/details").post(QuoteController.getQuoteEstimateById);
router.route("/quoteEstimate/update").post(QuoteController.updateQuoteEstimate);

router.route("/estimateQuote/create").post(QuoteController.createEstimateQuote);

router.route("/quotePricing/create").post(QuoteController.createQuotePricing);
router.route("/quotePricing/details").post(QuoteController.getQuotePricingById);
router.route("/quotePricing/update").post(QuoteController.updateQuotePricing);
router.route("/pieceCount/create").post(QuoteController.createPieceCount);
router.route("/pieceCount/update").post(QuoteController.updatePieceCount);
router.route("/pieceCount/delete").post(QuoteController.deletePieceCount);
router.route("/pieceCount/list").post(QuoteController.getAllPieceCounts);
router.route("/mainsteelsettings").get(QuoteController.mainSteelSettings);
router.route("/otherActivity").get(QuoteController.otherActivity);

// pos api
router.route("/pos/create").post(PoController.createPos);
router.route("/pos/list").post(PoController.listPos);
router.route("/pos/duplicate").put(PoController.duplicatePos);
router.route("/pos/delete").post(PoController.deletePos);
router.route("/pos/update").post(PoController.updatePos);
router.route("/pos/details").post(PoController.getPosById);

// cor api
router.route("/cor/create").post(CorController.createCors);
router.route("/cor/list").post(CorController.listCors);
router.route("/cor/duplicate").put(CorController.duplicateCors);
router.route("/cor/delete").post(CorController.deleteCors);
router.route("/cor/update").post(CorController.updateCors);
router.route("/cor/details").post(CorController.getCorById);

// invoice api
router.route("/invoice/create").post(InvoiceController.createInvoice);
router.route("/invoice/list").post(InvoiceController.listInvoice);
router.route("/invoice/duplicate").put(InvoiceController.duplicateInvoice);
router.route("/invoice/delete").post(InvoiceController.deleteInvoice);
router.route("/invoice/update").post(InvoiceController.updateInvoice);
router.route("/invoice/details").post(InvoiceController.getInvoiceById);
router.route("/invoices").get(InvoiceController.invoices);

// payment api
router.route("/payment/create").post(PaymentController.createPayment);
router.route("/payment/list").post(PaymentController.listPayment);
router.route("/payment/duplicate").put(PaymentController.duplicatePayment);
router.route("/payment/delete").post(PaymentController.deletePayment);
router.route("/payment/update").post(PaymentController.updatePayment);
router.route("/payment/details").post(PaymentController.getPaymentById);

// User related apis
router.route("/user/all").post(UserController.queryAllUser);
router.route("/user/resetpasswordattempt").post(UserController.resetPasswordAttempt);
router.route("/user/create").post(UserController.createUser);
router.route("/user/details").post(UserController.getUserById);
router.route("/user/update").post(UserController.updateUser);
router.route("/user/delete").post(UserController.deleteUser);
router.route("/reset/password").put(UserController.resetPassword);
router.route("/user/password/generate/:token").put(UserController.generatePassword);
router.route("/user/resend/otp").post(UserController.resendOtp);
router.route("/user/createdBy").get(UserController.queryCreatedByUsers);

//forgot password api
router.route("/user/forgot/password").post(UserController.forgotPasswordVerificationLink);
router.route("/user/verify/token").post(UserController.verifySessionToken);
router.route("/user/verify/oldpassword").post(UserController.verifyAndUpdatePassword);

// leave request api
router.route("/leaverequest/create").post(LeaveRequestController.createLeaveRequest);
router.route("/leaverequest/list").post(LeaveRequestController.listLeaveRequest);
router.route("/leaverequest/delete").post(LeaveRequestController.deleteLeaveRequest);
router.route("/leaverequest/update").post(LeaveRequestController.updateLeaveRequest);
router.route("/leaverequest/details").post(LeaveRequestController.getLeaveRequestById);

router.route("/expenseclaim/create").post(ExpenseClaimController.createExpenseClaim);
router.route("/expenseclaim/list").post(ExpenseClaimController.listExpenseClaim);
router.route("/expenseclaim/delete").post(ExpenseClaimController.deleteExpenseClaim);
router.route("/expenseclaim/update").post(ExpenseClaimController.updateExpenseClaim);
router.route("/expenseclaim/details").post(ExpenseClaimController.getExpenseClaimById);

// expenses api
router.route("/expense/create").post(ExpensesController.createExpense);
router.route("/expense/list").post(ExpensesController.listExpense);
router.route("/expense/delete").post(ExpensesController.deleteExpense);
router.route("/expense/update").post(ExpensesController.updateExpense);
router.route("/expense/details").post(ExpensesController.getExpenseById);

//----------------- //

// admin new dashboard api //
router.route("/dashboard/count").post(DashboardController.getAdminDashboardCount);
router.route("/dashboard/projectStatusDistribution").post(DashboardController.projectStatusDistribution);
router.route("/dashboard/timesheet/graph").post(DashboardController.getAdminTimesheetGraph);

// new employee setting api //
router.route("/user/profile/update").post(UserController.updateUserProfile);
router.route("/user/change/password").post(UserController.changePassword);
router.route("/user/notification/setting").post(UserController.changeNotificationSetting);

// manager //
router.route("/manager/dashboard/count").post(DashboardController.getDashboardCountManager);

//dashboard
router.route("/employee/dashboard/count").post(DashboardController.getDashboardCountEmployee);
router.route("/employee/assignedtasks").post(DashboardController.assingnedTaskList);
router.route("/employee/overduetasks").post(DashboardController.overDueTaskList);
router.route("/employee/feedbacks").post(DashboardController.feedbackList);
router.route("/employee/timesheet/graph").post(DashboardController.getTimesheetGraph);

router.route("/policies").post(DashboardController.policyList);
router.route("/events").post(DashboardController.eventList);

router.route("/birthday/wish/send").post(BirthDayWisheshController.sendBirthdayWish);
router.route("/birthday/wish/list").post(BirthDayWisheshController.getBirthdayWishes);

// policy api
router.route("/policy/create").post(PolicyController.createPolicy);
router.route("/policy/list").post(PolicyController.listPolicy);
router.route("/policy/delete").post(PolicyController.deletePolicy);
router.route("/policy/update").post(PolicyController.updatePolicy);
router.route("/policy/details").post(PolicyController.getPolicyById);

// announcement api
router.route("/announcement/create").post(AnnouncementController.createAnnouncement);
router.route("/announcement/list").post(AnnouncementController.listAnnouncement);
router.route("/announcement/delete").post(AnnouncementController.deleteAnnouncement);
router.route("/announcement/update").post(AnnouncementController.updateAnnouncement);
router.route("/announcement/details").post(AnnouncementController.getAnnouncementById);

// event api
router.route("/event/create").post(EventController.createEvent);
router.route("/event/list").post(EventController.listEvent);
router.route("/event/delete").post(EventController.deleteEvent);
router.route("/event/update").post(EventController.updateEvent);
router.route("/event/details").post(EventController.getEventById);
//----------------- //

//bulk upoload for user
router
  .route("/user/upload")
  .put(multipartUpload.any(), normalizeAttachmentFiles, UserController.uploadBulkUsers);

//bulk upload history
router.route("/upload/files/history").post(UserController.listUploadedFiles);
router.route("/upload/row").post(UserController.rowcount);

//customer
router.route("/customer/create").post(customerController.createCustomer);
router.route("/customer/list").post(customerController.queryAllCustomer);
router.route("/customer").get(customerController.allCustomer);
router.route("/customer/update").post(customerController.updateCustomer);
router.route("/customer/delete").post(customerController.deleteCustomer);
router.route("/customer/upload").put(customerController.uploadFiles);
router.route("/customer/details").post(customerController.getCustomerById);
router.route("/customer/createdby/dropdown").get(customerController.queryCreatedByUsers);
router.route("/customer/dropdown").post(customerController.queryAllCustomerDropdown);
router
  .route("/customers/bulk/upload")
  .put(
    multipartUpload.any(),
    normalizeAttachmentFiles,
    customerController.uploadbulkCustomer,
  );

//organization
router.route("/organization/create").post(OrganizationController.createOrganization);
router.route("/organization/update").post(OrganizationController.updateOrganization);
router.route("/organization/delete").post(OrganizationController.deleteOrganization);
router.route("/organization/list").post(OrganizationController.listOrganization);
router.route("/organization/details").post(OrganizationController.organizationById);
router.route("/organization/createdby/dropdown").get(OrganizationController.queryCreatedByUsers);

//project
router.route("/project/create").post(ProjectController.createProject);
router.route("/project/update").post(ProjectController.updateProject);
router.route("/project/delete").post(ProjectController.deleteProject);
router.route("/project/list").post(ProjectController.listProject);
router.route("/projects").get(ProjectController.projects);
router.route("/project/details").post(ProjectController.projectById);
router.route("/mainProject/list").post(MainProjectController.listMainProjects);
router.route("/mainProject/create").post(MainProjectController.createMainProject);
router.route("/mainProject/details").post(MainProjectController.getMainProjectDetails);
router.route("/mainProject/issue/create").post(MainProjectController.createSpaceIssue);
router.route("/mainProject/issue/update").post(MainProjectController.updateSpaceIssue);
router.route("/mainProject/update").post(MainProjectController.updateMainProject);
router.route("/mainProject/delete").post(MainProjectController.deleteMainProject);
router.route("/project/manager/list/all").post(ProjectController.listDownProjectHeadByProjectId);
router.route("/project/allocations/employees").post(ProjectController.getAllWorkAllocationsForProjects);

//projectHoursExtension
router.route("/projectHoursExtension/create").post(ProjectController.createProjectHoursExtensionRequest);
router.route("/projectHoursExtension/details").post(ProjectController.getProjectHoursExtensionRequestDetails);
router.route("/projectHoursExtension/status").post(ProjectController.changeProjectHoursExtensionStatus);


//all dropdown values api
router.route("/get/dropdown/value").post(OptionsController.getDropdownValue);
router.route("/dropdown/organization").post(OrganizationController.dropdownOrganization);
router.route("/dropdown/project").post(ProjectController.dropdownProject);
router.route("/dropdown/status/project").post(ProjectController.dropDownProjectStatus);
router.route("/dropdown/project/createdBy").get(ProjectController.createdByDropdown);

// api for
router.route("/setting/create").post(OptionsController.CreateSetting);
router.route("/setting/update").post(OptionsController.updateSetting);
router.route("/setting/list").post(OptionsController.getOptionList);
router.route("/setting/delete").post(OptionsController.deleteOptions);
router.route("/setting/details").post(OptionsController.getOptionById);
router.route("/setting/dropdown/list").post(OptionsController.getDropdownOptions);

// api for the activity module
router.route("/activity/create").post(ActivityController.createActivity);
router.route("/activity/subactivity/create").post(ActivityController.createSubactivity);
router.route("/activity/update").post(ActivityController.updateActivity);
router.route("/activity/subactivity/update").post(ActivityController.updateSubactivity);
router.route("/activity/all").post(ActivityController.fetchAllActivities);
router.route("/activity/delete").post(ActivityController.deleteActivity);
router.route("/activity/details").post(ActivityController.fetchActivityById);
router.route("/activity/comment/add").post(ActivityController.addComment);
router.route("/activity/comment/update").post(ActivityController.updateComment);
router.route("/activity/comment/delete").post(ActivityController.deleteComment);
router.route("/activity/dropdown").post(ActivityController.activityDropdown);
router.route("/activity/createdby/dropdown").get(ActivityController.queryCreatedByDropdown);
router.route("/activity/subactivity/list").post(ActivityController.fetchSubActivities);

//apis for timesheet
router.route("/timesheet/create").post(TimesheetController.createdTimesheet);
router.route("/timesheet/update").post(TimesheetController.updateTimeSheet);
router.route("/timesheet/delete").post(TimesheetController.deleteTimesheet);
router.route("/timesheet/details").post(TimesheetController.getTimesheetDetailsById);
router.route("/timesheet/all").post(TimesheetController.listAllTimeSheetData);
router.route("/timesheet/change/status").post(TimesheetController.changeStatus);
router.route("/timesheet/logs").post(TimesheetController.getTimesheetLogs);

router.route("/timesheet/pending").post(TimesheetController.listPendingTimeSheet);

// api for department module
router.route("/department/create").post(DepartmentController.createDepartment);
router.route("/department/update").post(DepartmentController.updateDepartment);
router.route("/department/employee/count").post(DepartmentController.getDepartmentEmployeeCount);
router.route("/department/delete").post(DepartmentController.deleteDepartment);
router.route("/department/list").post(DepartmentController.getAllDepartments);
router.route("/department/details").post(DepartmentController.getDepartmentById);
router.route("/department/dropdown").post(DepartmentController.getDepartmentDropdown);
router.route("/department/createdby/dropdown").get(DepartmentController.queryCreatedByDepartment);

//teams
router.route("/teams/create").post(TeamsController.createTeams);
router.route("/teams/list").post(TeamsController.queryAllTeams);
router.route("/teams/details").post(TeamsController.getTeamById);
router.route("/teams/update").post(TeamsController.updateTeam);
router.route("/teams/delete").post(TeamsController.deleteTeam);
router.route("/teams/manager/create").post(TeamsController.createTeamForManager);
router.route("/teams/manager/delete").post(TeamsController.deleteTeamForManager);
router.route("/teams/manager/list").post(TeamsController.queryTeamsForManager);

//api for feedback
router.route("/feedback/list").post(FeedBack.queryFeedback);
router.route("/rating/create").post(FeedBack.submitRatingFeedback);
router.route("/appreciation/create").post(FeedBack.submitAppreciationFeedback);
router.route("/feedback/update").post(FeedBack.updateFeedback);
router.route("/feedback/delete").post(FeedBack.softDeleteFeedback);
router.route("/feedback/details").post(FeedBack.getFeedbackById);

//api for allocation for project
router.route("/project/allocation/create").post(TimesheetController.createProjectAllocation);

//below is the api's for allocation activity and subactivity comments
router.route("/allocation/activity/comment/add").post(TimesheetController.addActivityComment);
router.route("/allocation/activity/comment/update").post(TimesheetController.updateActivityComment);
router.route("/allocation/activity/comment/delete").post(TimesheetController.deleteActivityComment);

//below is the api's for allocation activity and subactivity comments
router.route("/allocation/subactivity/comment/add").post(TimesheetController.addSubActivityComment);
router.route("/allocation/subactivity/comment/update").post(TimesheetController.updateSubActivityComment);
router.route("/allocation/subactivity/comment/delete").post(TimesheetController.deleteSubActivityComment);

//get all activity and subactivity comments
router.route("/allocation/activity/comments").post(TimesheetController.getActivityComments);
router.route("/allocation/subactivity/comments").post(TimesheetController.getSubActivityComments);

//api's for likes,dislike,reply
router.route("/allocation/activity/comment/like").post(TimesheetController.likeComment);
router.route("/allocation/activity/comment/dislike").post(TimesheetController.dislikeComment);
router.route("/allocation/activity/comment/reply").post(TimesheetController.replyComment);
router.route("/allocation/activity/comment/reply/delete").post(TimesheetController.deleteReply);
router.route("/allocation/activity/comment/update").post(TimesheetController.updateActivityComment);

//for subactivity likes,dislikes,comments
router.route("/allocation/subactivity/comment/like").post(TimesheetController.likeSubActivityComment);
router.route("/allocation/subactivity/comment/dislike").post(TimesheetController.dislikeSubActivityComment);
router.route("/allocation/subactivity/comment/reply").post(TimesheetController.replySubActivityComment);
router.route("/allocation/subactivity/comment/reply/delete").post(TimesheetController.deleteSubActivityReply);
router.route("/allocation/subactivity/comment/update").post(TimesheetController.updateSubActivityComment);

//check for existing work allocation api
router.route("/work/allocation/check").post(TimesheetController.checkWorkAllocationExists);

//work aloocation api's
// router.route("/allocation/work/create").post(WorkAllocation.createAllocation);
router.route("/allocation/work/update").post(WorkAllocation.updateWorkAllocation);
router.route("/allocation/work/all").post(WorkAllocation.listAllAllocations);
router.route("/allocation/work/delete").post(WorkAllocation.deleteWorkAllocation);
router.route("/allocation/work/details").post(WorkAllocation.getAllocationById);
router.route("/allocation/createdby/dropdown").get(WorkAllocation.queryCreatedByUsers);

router.route("/task/count").get(WorkAllocation.taskCount);
router.route("/task/deadlines").post(WorkAllocation.taskDeadlines);

//pr document api's
router.route("/allocation/pr/create").post(WorkAllocation.createDocument);
router.route("/allocation/pr/get").post(WorkAllocation.getDocument);
router.route("/allocation/pr/update").post(WorkAllocation.updateDocument);
router.route("/allocation/pr/delete").post(WorkAllocation.deleteDocument);

router.route("/resource-management").post(ResourceManagementController.getResourceManagement);

//dashboard
router.route("/dashboard/count/employee").post(DashboardController.getDashboardCountEmployeeSession);

router.route("/dashboard/list/employee").post(DashboardController.getDashboardEmployee);
router.route("/dashboard/workallocations").post(DashboardController.workallocations);
router.route("/dashboard/manager").post(DashboardController.getDashboardDataManager);
router.route("/dashboard/graph").post(DashboardController.getGraphData);
router.route("/dashboard/feedback").post(DashboardController.getFeedbackByEmployeeId);
router.route("/dashboard/organization").post(DashboardController.getDashboardDataOrganization);
router.route("/dashboard/organization/graph").post(DashboardController.getGraphDataOrganizationgraph);
router.route("/dashboard/option/get").post(DashboardController.getAvailableOptions);
router.route("/dashboard/assign/view/project").post(DashboardController.employeeAssignOrganiztion);
router.route("/dashboard/assign/view/project/manager").post(DashboardController.employeeAssignManager);

// router.route("/date").post(DashboardController.getDateRange);
router.route("/list/all/tasknames").post(WorkAllocation.listAllocationTaskNames);

//email templates apis
router.route("/email/templates/all").post(EmailTemplateController.listAllEmailTemplate);
router.route("/email/templates/create").post(EmailTemplateController.createEmailTemplate);
router.route("/email/templates/update").post(EmailTemplateController.updateEmailTemplate);
router.route("/email/templates/delete").post(EmailTemplateController.deleteEmailTemplate);
router.route("/email/templates/get/details").post(EmailTemplateController.emailTemplateDetailById);
router.route("/email/templates/get/dropdowns").post(EmailTemplateController.allEmailTemplateDropdown);
router.route("/email/templates/createdby").post(EmailTemplateController.queryCreatedByEmailTemplate);

//Notification releted Api's
router.route("/notification/all").get(NotificationController.queryAllNotification);
router.route("/notification/read").get(NotificationController.markAsRead);
router.route("/notification/unread/count").get(NotificationController.unreadNotificationCount);
router.route("/notification/mark/read/all").get(NotificationController.markAllAsRead);

// group apis //
router.route("/group/create").post(GroupController.createGroup);
router.route("/group/update").post(GroupController.updateGroup);
router.route("/group/leave").post(GroupController.leaveGroup);
router.route("/group/member/remove").post(GroupController.removeMember);
router.route("/groups").post(GroupController.groups);
router.route("/persons").post(GroupController.persons);

// chat APIs (realtime + REST fallbacks)
router.route("/chat/session").post(ChatController.ensureSession);
router.route("/chat/messages").post(ChatController.listMessages);
router.route("/chat/deleteforme").post(ChatController.deleteForMe);
router.route("/chat/deleteforeveryone").post(ChatController.deleteForEveryone);
router.route("/chat/media").post(ChatController.getChatMediaBySession);

router.post(
  "/chat/message/send",
  (req, res, next) => {
    if (req.headers["content-type"]?.includes("multipart/form-data")) {
      upload.single("file")(req, res, next);
    } else {
      next();
    }
  },
  ChatController.sendMessage,
);

router.route("/ai/chat").post(GroqAiController.chat);
module.exports = router;
