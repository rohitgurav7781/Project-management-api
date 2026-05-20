const KANBAN_BOARD = {
  templateId: "kanban",
  boardType: "kanban",
  spaceType: "Team-managed software",
  boardColumns: [
    { id: "todo", name: "To Do", statusKey: "TODO", order: 0, wipLimit: null },
    { id: "in_progress", name: "In Progress", statusKey: "IN_PROGRESS", order: 1, wipLimit: null },
    { id: "done", name: "Done", statusKey: "DONE", order: 2, wipLimit: null },
  ],
  workTypes: [
    { key: "epic", label: "Epic", color: "#5E4DB2", icon: "epic" },
    { key: "story", label: "Story", color: "#1F845A", icon: "story" },
    { key: "bug", label: "Bug", color: "#C9372C", icon: "bug" },
    { key: "task", label: "Task", color: "#0C66E4", icon: "task" },
    { key: "subtask", label: "Sub-task", color: "#0C66E4", icon: "subtask" },
  ],
  workflowStatuses: [
    { label: "TO DO", statusKey: "TODO", bgcolor: "#38414A", color: "#B6C2CF" },
    { label: "IN PROGRESS", statusKey: "IN_PROGRESS", bgcolor: "#0C66E4", color: "#FFFFFF" },
    { label: "DONE", statusKey: "DONE", bgcolor: "#1F845A", color: "#FFFFFF" },
  ],
};

const SCRUM_BOARD = {
  ...KANBAN_BOARD,
  templateId: "scrum",
  boardType: "scrum",
  spaceType: "Team-managed software",
};

const SERVICE_BOARD = {
  templateId: "general-service",
  boardType: "kanban",
  spaceType: "Customer service management",
  boardColumns: [
    { id: "open", name: "Open", statusKey: "OPEN", order: 0, wipLimit: null },
    { id: "in_progress", name: "In Progress", statusKey: "IN_PROGRESS", order: 1, wipLimit: null },
    { id: "resolved", name: "Resolved", statusKey: "RESOLVED", order: 2, wipLimit: null },
  ],
  workTypes: [
    { key: "request", label: "Request", color: "#0C66E4", icon: "task" },
    { key: "incident", label: "Incident", color: "#C9372C", icon: "bug" },
    { key: "problem", label: "Problem", color: "#E56910", icon: "story" },
    { key: "change", label: "Change", color: "#5E4DB2", icon: "epic" },
  ],
  workflowStatuses: [
    { label: "OPEN", statusKey: "OPEN", bgcolor: "#38414A", color: "#B6C2CF" },
    { label: "IN PROGRESS", statusKey: "IN_PROGRESS", bgcolor: "#0C66E4", color: "#FFFFFF" },
    { label: "RESOLVED", statusKey: "RESOLVED", bgcolor: "#1F845A", color: "#FFFFFF" },
  ],
};

const IT_BOARD = {
  ...SERVICE_BOARD,
  templateId: "basic-it",
  spaceType: "Team-managed service",
};

const TEMPLATE_MAP = {
  kanban: KANBAN_BOARD,
  scrum: SCRUM_BOARD,
  "general-service": SERVICE_BOARD,
  "basic-it": IT_BOARD,
};

const getSpaceTemplateConfig = (templateId) =>
  TEMPLATE_MAP[templateId] || KANBAN_BOARD;

module.exports = {
  getSpaceTemplateConfig,
  KANBAN_BOARD,
};
