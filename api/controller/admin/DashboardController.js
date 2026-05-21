/**
 * Dashboard API facade — delegates to focused controllers under ./dashboard/
 * Keeps existing route imports working without changes.
 */
const DashboardManagerController = require("./dashboard/DashboardManagerController");
const DashboardAdminController = require("./dashboard/DashboardAdminController");
const DashboardContentController = require("./dashboard/DashboardContentController");
const DashboardEmployeeController = require("./dashboard/DashboardEmployeeController");
const DashboardGraphController = require("./dashboard/DashboardGraphController");

module.exports = {
  ...DashboardManagerController,
  ...DashboardAdminController,
  ...DashboardContentController,
  ...DashboardEmployeeController,
  ...DashboardGraphController,
};
