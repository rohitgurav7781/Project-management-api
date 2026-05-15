const cron = require("node-cron");
const TimeSheet = require("../api/models/Timesheet");
const Notification = require("../api/models/Notification");

// Cron job to run every hour
cron.schedule("0 10 * * *", async () => {
  try {
    const currentTime = Math.floor(Date.now() / 1000);

    // Query timesheets with deadlines in the next 24 hours or past ones
    const timeSheets = await TimeSheet.find({
      endDateTime: { $lte: currentTime + 24 * 60 * 60 },
      active: true,
    });

    // Process each timesheet
    for (let sheet of timeSheets) {
      const taskName = sheet.activityName;

      if (sheet.endDateTime > currentTime) {
        // Create a reminder notification
        await Notification.create({
          userType: "employee",
          recordId: sheet._id,
          userId: sheet.employeeId,
          organizationId: sheet.organizationId,
          title: "Task Deadline Reminder",
          body: `The deadline for the task "${taskName}" is approaching. Complete it on time!`,
          type: "system",
          read: false,
          visibleOnHome: true,
          actionUrl: `/timesheet?id=${sheet._id}`,
        });
      } else if (sheet.endDateTime < currentTime) {
        // Create a missed deadline notification
        await Notification.create({
          userType: "employee",
          recordId: sheet._id,
          userId: sheet.employeeId,
          organizationId: sheet.organizationId,
          title: "Task Deadline Missed",
          body: `The deadline for the task "${taskName}" has passed. Please take immediate action.`,
          type: "system",
          read: false,
          visibleOnHome: true,
          actionUrl: `/timesheet?id=${sheet._id}`,
        });
      }
    }
  } catch (error) {
    console.error("Error sending task deadline reminders or missed notifications:", error);
  }
});

console.log("Cron job will trigger every 10:00 AM in the morning...");
