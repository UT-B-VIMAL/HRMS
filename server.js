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

const {
  registerSocket,
  unregisterSocket,
  userSockets,
} = require("./helpers/notificationHelper");
const monthlyNotificationCron = require("./cron/monthlyNotification"); // Import the monthly notification cron job
const dailyAttendanceNotificationCron = require("./cron/dailyAttendanceNotification"); // Import the daily attendance notification cron job

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
  RoleController.checkRole(),
  loginController.changePassword
);
apiRouter.post("/forgot_password", loginController.forgotPassword);
apiRouter.post("/verifyOtp", loginController.verifyOtp);
apiRouter.post("/user_timeline", loginController.logTaskTimeline);
apiRouter.post("/reset_password", loginController.reset_password);
apiRouter.post("/profile", profileController.createOrUpdateProfile);
apiRouter.get("/profile/:id", profileController.getProfile);

// User Routes
apiRouter.post("/user", userController.createUser);
apiRouter.put(
  "/user/:id",
  RoleController.checkRole(),
  userController.updateUser
);
apiRouter.delete(
  "/user/:id",
  RoleController.checkRole(),
  userController.deleteUser
);
apiRouter.get("/user/:id", RoleController.checkRole(), userController.getUser);
apiRouter.get("/user", RoleController.checkRole(), userController.getAllUsers);

// Product Routes
apiRouter.post(
  "/products",
  RoleController.checkRole(),
  productController.createProduct
);
apiRouter.put(
  "/products/:id",
  RoleController.checkRole(),
  productController.updateProduct
);
apiRouter.delete(
  "/products/:id",
  RoleController.checkRole(),
  productController.deleteProduct
);
apiRouter.get(
  "/products/:id",
  RoleController.checkRole(),
  productController.getProduct
);
apiRouter.get(
  "/products",
  RoleController.checkRole(),
  productController.getAllProducts
);

// Project Routes
apiRouter.post(
  "/projects",
  RoleController.checkRole(),
  projectController.createProject
);
apiRouter.put(
  "/projects/:id",
  RoleController.checkRole(),
  projectController.updateProject
);
apiRouter.delete(
  "/projects/:id",
  RoleController.checkRole(),
  projectController.deleteProject
);
apiRouter.get(
  "/projects/:id",
  RoleController.checkRole(),
  projectController.getProject
);
apiRouter.get(
  "/projects",
  RoleController.checkRole(),
  projectController.getAllProjects
);
apiRouter.get("/project_status", projectController.project_status);
apiRouter.get(
  "/project_request",
  RoleController.checkRole(),
  projectController.project_request
);
apiRouter.get(
  "/project_requestupdate",
  RoleController.checkRole(),
  projectController.project_requestupdate
);
apiRouter.put(
  "/project_requestchange/:id",
  RoleController.checkRole(),
  (req, res) => projectController.project_requestchange(req, res, req.io)
);

// Team Routes
apiRouter.post("/team", RoleController.checkRole(), teamController.createTeam);
apiRouter.put(
  "/team/:id",
  RoleController.checkRole(),
  teamController.updateTeam
);
apiRouter.delete(
  "/team/:id",
  RoleController.checkRole(),
  teamController.deleteTeam
);
apiRouter.get("/team/:id", RoleController.checkRole(), teamController.getTeam);
apiRouter.get("/team", RoleController.checkRole(), teamController.getAllTeams);

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
apiRouter.post("/task", RoleController.checkRole(), taskController.createTask);
apiRouter.put(
  "/task/:id",
  RoleController.checkRole(),
  taskController.updateTask
);
apiRouter.delete(
  "/task/:id",
  RoleController.checkRole(),
  taskController.deleteTask
);
apiRouter.get("/task/:id", RoleController.checkRole(), taskController.getTask);
apiRouter.get("/task", RoleController.checkRole(), taskController.getAllTasks);
apiRouter.put("/taskupdate/:id", RoleController.checkRole(), (req, res) =>
  taskController.updateDatas(req, res, req.io)
);
apiRouter.get(
  "/getTaskDatas",
  RoleController.checkRole(),
  taskController.getTaskDatas
);
apiRouter.get("/doneTask", RoleController.checkRole(), taskController.doneTask);
apiRouter.post(
  "/updateTaskTimeLineStatus",
  RoleController.checkRole(),
  (req, res) => taskController.updateTaskTimeLineStatus(req, res, req.io)
);
apiRouter.get(
  "/getWorkReport",
  RoleController.checkRole(),
  taskController.workReport
);
apiRouter.get(
  "/deletedTaskList",
  RoleController.checkRole(),
  taskController.deletedTaskList
);
apiRouter.post(
  "/restoreTasks",
  RoleController.checkRole(),
  taskController.taskRestore
);

// Subtask Routes
apiRouter.post("/subtaskImport", subtaskController.bulkimportSubTask);

apiRouter.post(
  "/subtask",
  RoleController.checkRole(),
  subtaskController.createSubTask
);
apiRouter.put(
  "/subtask/:id",
  RoleController.checkRole(),
  subtaskController.updateSubTask
);
apiRouter.delete(
  "/subtask/:id",
  RoleController.checkRole(),
  subtaskController.deleteSubTask
);
apiRouter.get(
  "/subtask/:id",
  RoleController.checkRole(),
  subtaskController.getSubTask
);
apiRouter.get(
  "/subtask",
  RoleController.checkRole(),
  subtaskController.getAllSubTasks
);
apiRouter.put("/subtaskupdate/:id", RoleController.checkRole(), (req, res) =>
  subtaskController.updateDatas(req, res, req.io)
);

// Idle Employee Route
apiRouter.get(
  "/idleEmployee",
  RoleController.checkRole(),
  idleEmployeeController.get_idleEmployee
);

// PM Dashboard Routes
apiRouter.get(
  "/pmproducts",
  RoleController.checkRole(),
  pmdashboardController.pmproductsection
);
apiRouter.get(
  "/pmutilization",
  RoleController.checkRole(),
  pmdashboardController.pmutilizationsection
);
apiRouter.get(
  "/pmattendance",
  RoleController.checkRole(),
  pmdashboardController.pmattendancesection
);
apiRouter.get(
  "/pmdashboard",
  RoleController.checkRole(),
  pmdashboardController.pmdashboardsection
);
apiRouter.get(
  "/pmviewproduct",
  RoleController.checkRole(),
  pmdashboardController.pmviewproductsection
);
apiRouter.get(
  "/pmTasksByProduct",
  pmdashboardController.pmfetchUserTasksByProduct
);
apiRouter.get(
  "/pmUtilizationAndAttendance",
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
  RoleController.checkRole(),
  empdashboardController.empratingsection
);

// Productivity
apiRouter.get(
  "/teamwise_productivity",
  RoleController.checkRole(),
  productivityController.get_teamwiseProductivity
);
apiRouter.get(
  "/individual_status",
  RoleController.checkRole(),
  productivityController.get_individualProductivity
);

//rating
apiRouter.post("/updateRating", RoleController.checkRole(), (req, res) =>
  ratingController.ratingUpdations(req, res, req.io)
);
apiRouter.get(
  "/getRating",
  RoleController.checkRole(),
  ratingController.getRating
);
apiRouter.get(
  "/getAllUserRating",
  RoleController.checkRole(),
  ratingController.getAllUserRating
);
apiRouter.get(
  "/getAnnualRatings",
  RoleController.checkRole(),
  ratingController.getAnnualRatings
);

//Attendance
apiRouter.get(
  "/getAttendanceList",
  RoleController.checkRole(),
  attendanceController.getAttendanceList
);
apiRouter.post(
  "/updateAttendance",
  RoleController.checkRole(),
  attendanceController.updateAttendance
);
apiRouter.get(
  "/getAttendanceReport",
  RoleController.checkRole(),
  attendanceController.getAttendanceListReport
);
apiRouter.post("/all_present", (req, res) =>
  attendanceController.updateAttendanceAndNotify(req, res, req.io)
);

// Comments
apiRouter.post(
  "/comments",
  RoleController.checkRole(),
  commentsController.addComments
);
apiRouter.put(
  "/comments/:id",
  RoleController.checkRole(),
  commentsController.updateComments
);
apiRouter.delete(
  "/comments",
  RoleController.checkRole(),
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
  RoleController.checkRole(),
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
