const connection = require("../../../config/connection");
const mongoose = require("mongoose");
const fetchSafeData = require("../services/ai/fetchSafeData");

const { ChatGroq } = require("@langchain/groq");
const { ChatPromptTemplate, MessagesPlaceholder } = require("@langchain/core/prompts");
const { HumanMessage, AIMessage, SystemMessage } = require("@langchain/core/messages");

function isAdmin(session = {}) {
  const { userType, isSuperAdmin } = session || {};
  if (isSuperAdmin) return true;
  if (!userType) return false;
  const type = String(userType).toLowerCase();
  return type === "admin" || type === "organization admin";
}

const RESTRICTED_KEYWORDS = [
  "invoice",
  "payment",
  "transaction",
  "purchase order",
  "billing",
  "salary",
  "billable rate",
  "hourly rate",
  "revenue",
  "profit",
  "bank account",
  "tax",
  "expense claim",
  "reimburs",
  "payroll",
  "wage",
  "compensation",
  "quotation",
  "quote amount",
];

function isRestrictedQuestion(question, session) {
  if (isAdmin(session)) return false;
  const q = question.toLowerCase();
  return RESTRICTED_KEYWORDS.some(k => q.includes(k));
}

function buildSystemPromptText(session) {
  const admin = isAdmin(session);
  return `
You are an intelligent assistant embedded inside USICA — an organization management platform.

Current User  : ${session.userName || "User"}
Role          : ${session.userType || "Employee"}
Today's Date  : ${new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })}

DATA NOTES (important for answering correctly):
- All dates in the data have already been converted to readable strings. Do NOT attempt to re-convert them.
- Timesheet "duration" is a string like "9 hr : 0 min". Use this to report hours.
- Timesheet "durationRequired" is in minutes (e.g. 540 = 9 hours).
- "timesheet_summary" gives count breakdown (total, approved, pending, rejected).
- "timesheet_count" is the total number of timesheet records for this user.
- "project_count" is the total number of active projects in the organization.
- "project_summary" gives count breakdown by status (open, on_hold, completed, allocated, archived).
- Project "team" is a populated array — each item has fname and lname fields.
- Project "projectHead" is a populated array — each item has fname and lname fields.
- Project "customerId" is populated — use customerId.companyName for the customer name.
- Timesheet/WorkAllocation "projectId" is populated — use projectId.projectName for project name.
- Timesheet/WorkAllocation "employeeId" is populated — use employeeId.fname + employeeId.lname.
- "work_allocation_filter" tells you if work allocations are filtered for "today only" or "all".
- "invoice_summary" gives count breakdown (total, pending, paid, overdue).
- "invoice_count" is the total number of invoices.
- Invoice "totalAmount" is the final amount including tax.
- Invoice "balanceAmount" is the remaining unpaid amount.

STRICT RULES:
1. ${
    admin
      ? "You MAY reveal and compute financial data (invoices, payments, salaries, billing rates, expense claims) when explicitly requested. Treat this information as sensitive and answer only from the JSON data provided."
      : 'NEVER reveal or compute financial data - invoices, payments, salaries, billing rates, expense claims.\n   If asked, reply: "That information is confidential and not accessible here."'
  }
2. Answer ONLY from the JSON data provided in the user message. Never fabricate or guess.
3. If leave_today is present, use it as the definitive source for today's leave questions.
4. Keep answers concise, friendly, and well-structured. Use bullet points when listing items.
5. If the data array is empty, say: "I don't have that information available right now."
6. For count questions ("how many", "how much", "overall"), use the _count and _summary fields.
7. All dates in the data are already human-readable strings — use them as-is in your answer.

RESPONSE FORMAT RULES:
- Do NOT use markdown syntax like **, *, ##, or _
- For lists, use a clean format like:  "1. Name - Role"  or  "• Name - Role"
- Use plain readable text only
- Never use asterisks for bold — just write the text normally
`.trim();
}

function buildHistoryMessages(history = []) {
  return history.map(turn => {
    const content = turn.content || turn.text || "";
    if (turn.role === "assistant") return new AIMessage(content);
    return new HumanMessage(content);
  });
}

let _chatModel = null;
function getChatModel() {
  if (!_chatModel) {
    _chatModel = new ChatGroq({
      apiKey: connection.groq.apiKey,
      model: "llama-3.3-70b-versatile",
      temperature: 0.2,
      maxTokens: 4000,
      maxRetries: 2,
    });
  }
  return _chatModel;
}

function buildPromptTemplate() {
  return ChatPromptTemplate.fromMessages([
    ["system", "{systemPrompt}"],
    new MessagesPlaceholder("chatHistory"),
    ["human", "Relevant organizational data (use ONLY this to answer):\n{safeData}\n\nUser question: {question}"],
  ]);
}

module.exports = {
  chat: async (req, res, next) => {
    try {
      const { message, history = [] } = req.body;
      const session = req.session;

      if (!message || message.trim() === "") {
        return res.status(400).json({ message: "Message is required" });
      }

      if (isRestrictedQuestion(message, session)) {
        return res.status(200).json({
          answer:
            "I don't have access to financial data such as invoices, payments, or salaries. Please check those sections directly.",
          blocked: true,
        });
      }

      const organizationId = session.organizationId;
      if (!organizationId) {
        return res.status(400).json({ message: "Organization context missing" });
      }

      const safeData = await fetchSafeData(message, organizationId, session);

      const prompt = buildPromptTemplate();
      const model = getChatModel();

      const chain = prompt.pipe(model);

      const response = await chain.invoke({
        systemPrompt: buildSystemPromptText(session),
        chatHistory: buildHistoryMessages(history),
        safeData: JSON.stringify(safeData, null, 2),
        question: message,
      });

      const answer = (response.content || "").trim();

      return res.status(200).json({ answer, blocked: false });
    } catch (error) {
      console.error("LangChain/Groq AI Chat error:", error);
      return res.status(500).json({
        message: "Error processing AI request",
        error: error.message,
      });
    }
  },
};
