const express = require("express");
const fileUpload = require("express-fileupload");
const https = require("https");
const http = require("http");
const fs = require("fs");
require("dotenv").config({ path: __dirname + "/../.env" });
const cors = require("cors");
const bodyParser = require("./middleware/bodyParser");

const globalErrorHandler = require("./middleware/errorHandler");
const loginController = require("./controllers/loginController");
const userController = require("./controllers/userController");
const profileController = require("./controllers/profileController");
const productController = require("./controllers/productController");
const taskController = require("./controllers/taskController");
const subtaskController = require("./controllers/subtaskcontroller");
const idleEmployeeController = require("./controllers/idleEmployeeController");
const pmdashboardController = require("./controllers/pmController");
const productivityController = require("./controllers/productivityController");
const ratingController = require("./controllers/ratingController");
const projectController = require("./controllers/projectController");
const teamController = require("./controllers/teamController");
const designationController = require("./controllers/designationController");
const RoleController = require("./controllers/roleController");

const tldashboardController = require("./controllers/tldashboardController");
const attendanceController = require("./controllers/attendanceController");
const commonController = require("./controllers/commonController");
const empdashboardController = require("./controllers/empdashboardController");
const commentsController = require("./controllers/commentsController");
const ticketsController = require("./controllers/ticketsController");
const otdetailController = require("./controllers/otdetailController");
const expensedetailController = require("./controllers/expensedetailController");
const reportController = require("./controllers/reportController");
const notificationRoutes = require("./routes/notificationRoutes");
const permissionRoutes = require("./routes/permissionRoutes");
const roleRoutes = require("./routes/roleRoutes");

const {
  registerSocket,
  unregisterSocket,
  userSockets,
} = require("./helpers/notificationHelper");

// Cron jobs-------------------------------
require("./cron/monthlyNotification"); 
require("./cron/dailyAttendanceNotification");
require('./cron/autoPauseTasks');

const app = express();
const isProduction = fs.existsSync(process.env.PRIVATE_KEY_LINK);
const DOMAIN = isProduction ? process.env.LIVE_URL : process.env.LOCAL_URL;
const PORT = isProduction ? process.env.PORT : 3000;

// Socket-----------------------------------------------------------------------------
const socketIo = require("socket.io");
const notificationSocket = require("./sockets/notificationSocket");
const chatSocket = require("./sockets/chatSocket");

let server;

if (isProduction) {
  const options = {
    key: fs.readFileSync(process.env.PRIVATE_KEY_LINK),
    cert: fs.readFileSync(process.env.PRIVATE_CERTIFICATE_LINK),
  };

  server = https.createServer(options, app);
} else {
  server = http.createServer(app);
}

// Initialize socket.io
// Load allowed origins from env
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(origin => origin.trim())
  : [];


// const io = socketIo(server, {
//   cors: {
//     origin: (origin, callback) => {
//       if (!origin || allowedOrigins.includes(origin)) {
//         callback(null, true);
//       } else {
//         callback(new Error(`Origin ${origin} is not allowed by CORS`));
//       }
//     },
//     methods: ["GET", "POST"],
//     credentials: true,
//   },
// });
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
app.use((req, res, next) => {
  req.io = io;
  next();
});

const db = require("./config/db");
const path = require("path");
app.use(express.static(path.join(__dirname, "public")));

// Initialize notification socket
notificationSocket(io.of("/notifications"));

// Initialize chat socket
chatSocket(io.of("/chat"));

// Socket-----------------------------------------------------------------------------
const corsOptions = {
  origin: "*", // Allow all origins
  methods: ["GET", "POST", "PUT", "DELETE"],
  exposedHeaders: ['Content-Disposition']
  // allowedHeaders: ["Content-Type", "Authorization"]
};

// Load allowed origins from env
// const corsOptions = {
//   origin: (origin, callback) => {
    
//     if (!origin || allowedOrigins.includes(origin)) {
//       callback(null, true);
//     } else {
//       callback(new Error(`Origin ${origin} is not allowed by CORS`));
//     }
//   },
//   methods: ["GET", "POST", "PUT", "DELETE"],
//   allowedHeaders: ["Content-Type", "Authorization"],
// };


app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
const apiRouter = express.Router();
app.use(fileUpload());

apiRouter.post("/login", loginController.login);
apiRouter.post("/logout", loginController.logout);
apiRouter.put(
  "/change_password/:id",
  loginController.changePassword
);
apiRouter.post("/forgot_password", loginController.forgotPassword);
apiRouter.post("/verifyOtp", loginController.verifyOtp);
apiRouter.post("/user_timeline", loginController.logTaskTimeline);
apiRouter.post("/reset_password", loginController.reset_password);
apiRouter.post("/profile", profileController.createOrUpdateProfile);
apiRouter.get("/profile/:id", profileController.getProfile);

// User Routes
apiRouter.post("/user", RoleController.checkRole(['user.add_user']),userController.createUser);
apiRouter.post("/create-user", userController.createUserWithoutRole);

apiRouter.put(
  "/user/:id",
  RoleController.checkRole(['user.edit_user']),
  userController.updateUser
);
apiRouter.delete(
  "/user/:id",
  RoleController.checkRole(['user.delete_user']),
  userController.deleteUser
);
apiRouter.get("/user/:id", RoleController.checkRole(['user.view_user']), userController.getUser);
apiRouter.get("/user", RoleController.checkRole(['user.view_user']), userController.getAllUsers);

// Product Routes
apiRouter.post(
  "/products",
  RoleController.checkRole(['product_project.add_product']),
  productController.createProduct
);
apiRouter.put(
  "/products/:id",
  RoleController.checkRole(['product_project.edit_product']),
  productController.updateProduct
);
apiRouter.delete(
  "/products/:id",
  RoleController.checkRole(['product_project.delete_product']),
  productController.deleteProduct
);
apiRouter.get(
  "/products/:id",
  RoleController.checkRole(['product_project.edit_product']),
  productController.getProduct
);
apiRouter.get(
  "/products",
  RoleController.checkRole(['product_project.view_product']),
  productController.getAllProducts
);

// Project Routes
apiRouter.post(
  "/projects",
  RoleController.checkRole(['product_project.add_project']),
  projectController.createProject
);
apiRouter.put(
  "/projects/:id",
  RoleController.checkRole(['product_project.edit_project']),
  projectController.updateProject
);
apiRouter.delete(
  "/projects/:id",
  RoleController.checkRole(['product_project.delete_project']),
  projectController.deleteProject
);
apiRouter.get(
  "/projects/:id",
  RoleController.checkRole(['product_project.edit_project']),
  projectController.getProject
);
apiRouter.get(
  "/projects",
  RoleController.checkRole(['product_project.view_project']),
  projectController.getAllProjects
);
apiRouter.get("/project_status", projectController.project_status);
apiRouter.get(
  "/project_request",
  RoleController.checkRole(['project_request.all_project_request_view','project_request.team_project_request_view','project_request.exclude_project_request_view']),
  projectController.project_request
);
apiRouter.get(
  "/project_requestupdate",
  RoleController.checkRole(['project_request.project_request_update']),
  projectController.project_requestupdate
);
apiRouter.put(
  "/project_requestchange/:id",
  RoleController.checkRole(['project_request.project_request_update']),
  (req, res) => projectController.project_requestchange(req, res, req.io)
);

// Team Routes
apiRouter.post("/team", RoleController.checkRole(['team.add_team']), teamController.createTeam);
apiRouter.put(
  "/team/:id",
  RoleController.checkRole(['team.edit_team']),
  teamController.updateTeam
);
apiRouter.delete(
  "/team/:id",
  RoleController.checkRole(['team.delete_team']),
  teamController.deleteTeam
);
apiRouter.get("/team/:id", RoleController.checkRole(['team.edit_team']), teamController.getTeam);
apiRouter.get("/team", RoleController.checkRole(['team.view_team']), teamController.getAllTeams);

// Designation Routes
apiRouter.post(
  "/designations",
  RoleController.checkRole(),
  designationController.createDesignation
);
apiRouter.put(
  "/designations/:id",
  RoleController.checkRole(),
  designationController.updateDesignation
);
apiRouter.delete(
  "/designations/:id",
  RoleController.checkRole(),
  designationController.deleteDesignation
);
apiRouter.get(
  "/designations/:id",
  RoleController.checkRole(),
  designationController.getDesignation
);
apiRouter.get(
  "/designations",
  RoleController.checkRole(),
  designationController.getAllDesignations
);

// Task Routes
apiRouter.post("/taskImport", taskController.bulkimportTask);
apiRouter.post("/task", RoleController.checkRole(['kanban_board.add_task']), taskController.createTask);
apiRouter.put(
  "/task/:id",
  RoleController.checkRole(['kanban_board.edit_task']),
  taskController.updateTask
);
apiRouter.delete(
  "/task/:id",
  RoleController.checkRole(['kanban_board.delete_task']),
  taskController.deleteTask
);
apiRouter.get("/task/:id", RoleController.checkRole(['kanban_board.view_task']), taskController.getTask);
apiRouter.get("/task", RoleController.checkRole(['kanban_board.view_task']), taskController.getAllTasks);
apiRouter.put("/taskupdate/:id", RoleController.checkRole(['kanban_board.edit_task','task.start_task','task.pause_task','task.onhold_task','task.end_task','task.done_task','task.reopen_task']), (req, res) =>
  taskController.updateDatas(req, res, req.io)
);
apiRouter.get(
  "/getTaskDatas",
  RoleController.checkRole(['kanban_board.view_all_kanban_board_data','kanban_board.view_team_kanban_board_data','kanban_board.user_view_kanban_board_data']),
  taskController.getTaskDatas
);
apiRouter.get("/doneTask", RoleController.checkRole(['kanban_board.done_task']), taskController.doneTask);
apiRouter.post(
  "/updateTaskTimeLineStatus",
  RoleController.checkRole(['task.start_task','task.pause_task','task.end_task']),
  (req, res) => taskController.updateTaskTimeLineStatus(req, res, req.io)
);
apiRouter.get(
  "/getWorkReport",
  RoleController.checkRole(),
  taskController.workReport
);
apiRouter.get(
  "/deletedTaskList",
  RoleController.checkRole(['deleted_task.view_restore_project']),
  taskController.deletedTaskList
);
apiRouter.post(
  "/restoreTasks",
  RoleController.checkRole(['deleted_task.update_restore_project	']),
  taskController.taskRestore
);

// Subtask Routes
apiRouter.post("/subtaskImport", subtaskController.bulkimportSubTask);

apiRouter.post(
  "/subtask",
  RoleController.checkRole(['kanban_board.add_subtask']),
  subtaskController.createSubTask
);
apiRouter.put(
  "/subtask/:id",
  RoleController.checkRole(['kanban_board.edit_subtask']),
  subtaskController.updateSubTask
);
apiRouter.delete(
  "/subtask/:id",
  RoleController.checkRole(['kanban_board.delete_subtask']),
  subtaskController.deleteSubTask
);
apiRouter.get(
  "/subtask/:id",
  RoleController.checkRole(['kanban_board.view_subtask']),
  subtaskController.getSubTask
);
apiRouter.get(
  "/subtask",
  RoleController.checkRole(['kanban_board.view_subtask']),
  subtaskController.getAllSubTasks
);
apiRouter.put("/subtaskupdate/:id", RoleController.checkRole(['	kanban_board.edit_subtask','task.start_task','task.pause_task','task.onhold_task','task.end_task','task.done_task','task.reopen_task']), (req, res) =>
  subtaskController.updateDatas(req, res, req.io)
);

// Idle Employee Route
apiRouter.get(
  "/idleEmployee",
  RoleController.checkRole(['idle_employees.all_idle_employees_view','idle_employees.team_idle_employees_view','idle_employees.idle_employees_team_filter','idle_employees.show_excluded_roles']),
  idleEmployeeController.get_idleEmployee
);

// PM Dashboard Routes
apiRouter.get(
  "/pmTasksByProduct",RoleController.checkRole(['dashboard.all_product_graph','dashboard.team_product_graph','dashboard.user_product_graph']),
  pmdashboardController.pmfetchUserTasksByProduct
);
apiRouter.get(
  "/pmUtilizationAndAttendance",RoleController.checkRole(['dashboard.team_details']),
  pmdashboardController.pmUtilizationAndAttendance
);

apiRouter.get(
  "/getProjectCompletionPercentage",
  pmdashboardController.getProjectCompletionPercentage
);

// TL Dashboard Routes
apiRouter.get(
  "/tlattendance",
  RoleController.checkRole(),
  tldashboardController.tlattendancesection
);
apiRouter.get(
  "/tlrating",
  RoleController.checkRole(),
  tldashboardController.tlratingsection
);
apiRouter.get(
  "/tlproducts",
  RoleController.checkRole(),
  tldashboardController.tlproductsection
);
apiRouter.get(
  "/tlresourceallotment",
  RoleController.checkRole(),
  tldashboardController.tlresourceallotmentsection
);
apiRouter.get(
  "/tldashboard",
  RoleController.checkRole(),
  tldashboardController.tldashboardsection
);
apiRouter.get(
  "/tlviewproduct",
  RoleController.checkRole(),
  tldashboardController.tlviewproductsection
);

apiRouter.get(
  "/tltaskpendinglist",
  tldashboardController.tltaskpendinglist
);
apiRouter.get(
  "/getTeamWorkedHrs",
   RoleController.checkRole(['dashboard.team_weekly_working_hours','dashboard.user_weekly_working_hours','dashboard.show_excluded_roles']),
  tldashboardController.getTeamWorkedHrsDetails
);
// Employee Dashboard Routes
apiRouter.get(
  "/emppendingtask",
  RoleController.checkRole(),
  empdashboardController.emppendingtasksection
);
apiRouter.get(
  "/empdailybreakdown",
  RoleController.checkRole(),
  empdashboardController.empdailybreakdownsection
);
apiRouter.get(
  "/empstatistics",
  RoleController.checkRole(),
  empdashboardController.empstatisticssection
);
apiRouter.get(
  "/empstatisticschart",
  RoleController.checkRole(),
  empdashboardController.empstatisticschartsection
);
apiRouter.get(
  "/empratings",
  RoleController.checkRole(['dashboard.user_rating_view']),
  empdashboardController.empratingsection
);

// Productivity
apiRouter.get(
  "/teamwise_productivity",
  RoleController.checkRole(['productivity.view_teamwise_split','productivity.teamwise_split_filter']),
  productivityController.get_teamwiseProductivity
);
apiRouter.get(
  "/individual_status",
  RoleController.checkRole(['productivity.view_individual_split','productivity.individual_status_filter']),
  productivityController.get_individualProductivity
);

//rating
apiRouter.post("/updateRating", RoleController.checkRole(['rating.all_edit_rating','rating.team_edit_rating','rating.pm_notification','rating.admin_notification']), (req, res) =>
  ratingController.ratingUpdations(req, res, req.io));
apiRouter.get(
  "/getRating",
  RoleController.checkRole(),
  ratingController.getRating
);
apiRouter.get(
  "/getAllUserRating",
  RoleController.checkRole(['rating.team_view_monthly_rating','rating.all_view_monthly_rating','rating.excluded_roles']),
  ratingController.getAllUserRating
);
apiRouter.get(
  "/getAnnualRatings",
  RoleController.checkRole(['rating.team_view_annual_rating','rating.all_view_annual_rating','rating.excluded_roles']),
  ratingController.getAnnualRatings
);

//Attendance
apiRouter.get(
  "/getAttendanceList",
  RoleController.checkRole(['attendance.all_view_attendance','attendance.team_view_attendance','attendance.show_excluded_roles','attendance.exclude_from_associates']),
  attendanceController.getAttendanceList
);
apiRouter.post(
  "/updateAttendance",
  RoleController.checkRole(['attendance.edit_attendance']),
  attendanceController.updateAttendance
);
apiRouter.get(
  "/getAttendanceReport",
  RoleController.checkRole(),
  attendanceController.getAttendanceListReport
);
apiRouter.post("/all_present", (req, res) =>
  attendanceController.updateAttendanceAndNotify(req, res, req.io),
  RoleController.checkRole(['attendance.team_all_present','attendance.all_all_present','attendance.excluded_roles_all_present','attendance.exclude_from_associates_all_present'])
);

// Comments
apiRouter.post(
  "/comments",
  RoleController.checkRole(['kanban_board.add_task_comments','kanban_board.add_subtask_comments']),
  commentsController.addComments
);
apiRouter.get(
  "/comments/:id",
  RoleController.checkRole(['kanban_board.view_task_comments','kanban_board.view_subtask_comments']),
  commentsController.getComments
);

apiRouter.put(
  "/comments/:id",
  RoleController.checkRole(['kanban_board.edit_task_comments','kanban_board.edit_subtask_comments']),
  commentsController.updateComments
);

apiRouter.delete(
  "/comments",
  RoleController.checkRole(['kanban_board.delete_task_comments','kanban_board.delete_subtask_comments']),
  commentsController.deleteComments
);

//tickets
apiRouter.get(
  "/tickets",
  RoleController.checkRole(),
  ticketsController.getAlltickets
);
apiRouter.get(
  "/tickets/:id",
  RoleController.checkRole(),
  ticketsController.getTickets
);
apiRouter.post("/read-pending-tickets", ticketsController.readPendingTickets);
apiRouter.post("/tickets", RoleController.checkRole(), (req, res) =>
  ticketsController.createTicket(req, res, req.io)
);
apiRouter.put("/tickets/:id", RoleController.checkRole(), (req, res) =>
  ticketsController.updateTickets(req, res, req.io)
);
apiRouter.post("/ticket-comments", RoleController.checkRole(), (req, res) =>
  ticketsController.ticketComments(req, res, req.io)
);

// OT Details
apiRouter.post(
  "/otdetail",
  RoleController.checkRole(),
  otdetailController.createOtdetail
);
apiRouter.put(
  "/otdetail/:id",
  RoleController.checkRole(),
  otdetailController.updateOtdetail
);
apiRouter.put(
  "/approverejectotdetail/:id",
  RoleController.checkRole(),
  otdetailController.approve_reject_updateOtdetail
);
apiRouter.delete(
  "/otdetail/:id",
  RoleController.checkRole(),
  otdetailController.deleteOtdetail
);
apiRouter.get(
  "/otdetail/:id",
  RoleController.checkRole(),
  otdetailController.getOtdetail
);
apiRouter.get(
  "/otdetail",
  RoleController.checkRole(),
  otdetailController.getAllOtdetails
);
apiRouter.get(
  "/pmemployeeotdetail",
  RoleController.checkRole(),
  otdetailController.getAllpmemployeeOtdetails
);
apiRouter.get(
  "/tlemployeeotdetail",
  RoleController.checkRole(),
  otdetailController.getAlltlemployeeOtdetails
);
apiRouter.put(
  "/tlotdetail/:id",
  RoleController.checkRole(),
  otdetailController.updatetlOtdetail
);
apiRouter.post("/approve_reject_ot", RoleController.checkRole(), (req, res) =>
  otdetailController.approve_reject_otdetail(req, res, req.io)
);
apiRouter.get(
  "/getOtReport",
  RoleController.checkRole(),
  otdetailController.getOtReport
);

// Expense
apiRouter.post("/expensedetail", RoleController.checkRole(), (req, res) =>
  expensedetailController.createexpensedetail(req, res, req.io)
);
apiRouter.get(
  "/expensedetail/:id",
  RoleController.checkRole(),
  expensedetailController.getexpensedetail
);
apiRouter.put(
  "/expensedetail/:id",
  RoleController.checkRole(),
  expensedetailController.updateexpensedetail
);
apiRouter.put(
  "/approverejectexpensedetail/:id",
  RoleController.checkRole(),
  expensedetailController.updateexpensedetailflag
);
apiRouter.delete(
  "/expensedetail/:id",
  RoleController.checkRole(),
  expensedetailController.deleteexpensedetail
);
apiRouter.get(
  "/expensedetail",
  RoleController.checkRole(),
  expensedetailController.getAllexpensedetails
);
apiRouter.get(
  "/pmemployeeexpensedetail",
  RoleController.checkRole(),
  expensedetailController.getAllpmemployeeexpensedetails
);
apiRouter.get(
  "/tlemployeeexpensedetail",
  RoleController.checkRole(),
  expensedetailController.getAlltlemployeexpensedetails
);
apiRouter.get(
  "/getExpenseReport",
  RoleController.checkRole(),
  expensedetailController.getExpenseReports
);
apiRouter.post(
  "/approve_reject_expense",
  RoleController.checkRole(),
  (req, res) =>
    expensedetailController.approve_reject_expensedetail(req, res, req.io)
);
// Testing login api
apiRouter.get("/loginapi", empdashboardController.loginapis);

//common
apiRouter.get(
  "/getDropDownList",
  RoleController.checkRole(['role.view_role','kanban_board.priority_filter','kanban_board.priority_filter','kanban_board.project_filter','kanban_board.member_filter','kanban_board.team_filter','rating.team_filter','dropdown.all_products','dropdown.team_products','dropdown.user_products','dropdown.all_projects','dropdown.team_projects','dropdown.user_projects','dropdown.team_users','dropdown.managers','dropdown.ownteam_filter','kanban_board.add_task']),
  commonController.getDropDownList
);

//reports
apiRouter.get(
  "/getTimeReport",
  RoleController.checkRole(),
  reportController.getTimeListReport
);

// Ticket count
apiRouter.get(
  "/ticketcount/:id",
  RoleController.checkRole(),
  commonController.getTicketCount
);
// reportingusercheck
apiRouter.get(
  "/reportinguser/:id",
  RoleController.checkRole(),
  commonController.getreportinguser
);

// Use `/api` as a common prefix
app.use("/api", apiRouter);
app.use("/api", notificationRoutes);
app.use("/api", permissionRoutes);
app.use("/api", roleRoutes);

app.use(globalErrorHandler);

io.of("/notifications").on("connection", (socket) => {
  console.log(`Connected User for Notifications: ${socket.id}`);

  socket.on("register_notification", ({ userId }) => {
    registerSocket(userId, socket.id);
  });

  socket.on("disconnect", (reason) => {
    console.log(`User disconnected: ${socket.id} Reason: ${reason}`);
    for (const userId in userSockets) {
      if (userSockets[userId].includes(socket.id)) {
        unregisterSocket(userId, socket.id);
        break;
      }
    }
  });

  socket.on("error", (error) => {
    console.error("Socket error:", error);
  });

  socket.on("connect_error", (error) => {
    console.error("Socket connect error:", error);
  });
});

if (isProduction) {
  server.listen(PORT, () => {
    console.log(`Secure server is running on https://${DOMAIN}:${PORT}`);
  });
} else {
  // Development server (non-SSL)
  server.listen(PORT, () => {
    console.log(`Development server is running on http://localhost:${PORT}`);
  });
}

module.exports = app;
