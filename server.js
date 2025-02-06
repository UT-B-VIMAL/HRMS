const express = require("express");
const fileUpload = require("express-fileupload");
const https = require("https");
const http = require("http");
const fs = require("fs");
require('dotenv').config({ path: __dirname + '/../.env' });
const cors = require('cors');
const bodyParser = require("./middleware/bodyParser");

const globalErrorHandler = require("./middleware/errorHandler");
const loginController = require('./controllers/loginController');
const userController = require('./controllers/userController');
const productController = require('./controllers/productController');
const taskController = require('./controllers/taskController');
const subtaskController = require('./controllers/subtaskcontroller');
const idleEmployeeController = require('./controllers/idleEmployeeController');
const pmdashboardController = require('./controllers/pmController');
const productivityController = require('./controllers/productivityController');
const ratingController = require('./controllers/ratingController');
const projectController = require('./controllers/projectController');
const teamController = require('./controllers/teamController');
const designationController = require('./controllers/designationController');
const RoleController = require("./controllers/roleController");

const tldashboardController = require('./controllers/tldashboardController');
const attendanceController = require('./controllers/attendanceController');
const commonController = require("./controllers/commonController");
const empdashboardController = require('./controllers/empdashboardController');
const commentsController = require('./controllers/commentsController');
const ticketsController =require('./controllers/ticketsController');
const otdetailController =require('./controllers/otdetailController');
const expensedetailController =require('./controllers/expensedetailController');
const reportController = require('./controllers/reportController')

const multer = require('multer');
const upload = multer();
const app = express();
const isProduction = fs.existsSync(process.env.PRIVATE_KEY_LINK);
const DOMAIN = isProduction ? "frontendnode.hrms.utwebapps.com" : "localhost";
const PORT = isProduction ? 8085 : 3000;


// Socket-----------------------------------------------------------------------------
const socketIo = require('socket.io');

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
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});


const db = require('./config/db');
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));
const connectedUsers = {}; 

io.on('connection', (socket) => {
  console.log('Connected User:', socket.id);


  socket.on('register', async (data) => {
    const { ticket_id, id } = data;
    // Create a composite key from ticket_id and id. You can adjust the format as needed.
    const key = `${ticket_id}_${id}`;
  
    // Check if the composite key already exists in connectedUsers
    if (connectedUsers[key]) {
      console.log(`User ${key} is already connected with socket ID ${connectedUsers[key]}. Rejecting new connection.`);
      socket.emit('error', 'User is already connected on another socket.');
      socket.disconnect();
      return;
    }
  
    try {
      // When id is not 0, verify the user exists in your database
      if (id != 0) {
        const [results] = await db.execute('SELECT id FROM users WHERE id = ?', [id]);
        if (results.length > 0) {
          connectedUsers[key] = socket.id;
          console.log(`User ${key} registered with socket ID ${socket.id}`);
          socket.emit('register', `User ${key} registered with socket ID ${socket.id}`);
        } else {
          console.log(`User ID ${id} not found.`);
          socket.emit('error', `User ID ${id} not found.`);
        }
      } else {
        // Handle the special case for id == 0
        connectedUsers[key] = socket.id;
        console.log(`User ${key} registered with socket ID ${socket.id}`);
        socket.emit('register', `User ${key} registered with socket ID ${socket.id}`);
      }
    } catch (err) {
      console.error('Error fetching user:', err);
      socket.emit('error', 'Error during registration.');
    }
  });
  

  // Load messages from ticket_comments table
  socket.on('load messages', async (ticket_id) => {
      try {
          const [comments] = await db.execute(
              `SELECT 
                  tc.id,
                  tc.ticket_id,
                  tc.sender_id,
                  tc.receiver_id,
                  tc.comments,
                  CASE 
                  WHEN tc.sender_id = 0 THEN 'Anonymous'
                  ELSE CONCAT(COALESCE(sender.first_name, ''), ' ', COALESCE(NULLIF(sender.last_name, ''), '')) 
              END AS sender_name,
              CASE 
                  WHEN tc.receiver_id = 0 THEN 'Anonymous'
                  ELSE CONCAT(COALESCE(receiver.first_name, ''), ' ', COALESCE(NULLIF(receiver.last_name, ''), '')) 
              END AS receiver_name,
                  tc.created_at
              FROM ticket_comments tc
              LEFT JOIN users sender ON tc.sender_id = sender.id AND tc.sender_id != 0
          LEFT JOIN users receiver ON tc.receiver_id = receiver.id AND tc.receiver_id != 0
              WHERE tc.ticket_id = ? AND tc.deleted_at IS NULL
              ORDER BY tc.created_at ASC`,
              [ticket_id]
          );

          socket.emit('load messages', comments);
      } catch (error) {
          console.error('Error fetching ticket history:', error.message);
      }
  });

  socket.on('chat message', async (data) => {
    try {
        const { ticket_id, sender_id, receiver_id, comments } = data;

        
        console.log('Received data:', data);

      if (!ticket_id || !sender_id || !receiver_id || !comments) {
            throw new Error('Missing required fields.');
        }

        const [result] = await db.execute(
            `INSERT INTO ticket_comments (ticket_id, sender_id, receiver_id, comments, created_at, updated_at, deleted_at)
            VALUES (?, ?, ?, ?, NOW(), NOW(), NULL)`,
            [ticket_id, sender_id, receiver_id, comments]
        );

        console.log(`Message inserted into ticket_comments with ID: ${result.insertId}`);

        const [resultData] = await db.execute(
          `SELECT 
              tc.id,
              tc.ticket_id,
              tc.sender_id,
              tc.receiver_id,
              tc.comments,
              CASE 
                  WHEN tc.sender_id = 0 THEN 'Anonymous'
                  ELSE CONCAT(COALESCE(sender.first_name, ''), ' ', COALESCE(NULLIF(sender.last_name, ''), '')) 
              END AS sender_name,
              CASE 
                  WHEN tc.receiver_id = 0 THEN 'Anonymous'
                  ELSE CONCAT(COALESCE(receiver.first_name, ''), ' ', COALESCE(NULLIF(receiver.last_name, ''), '')) 
              END AS receiver_name,
              tc.created_at
          FROM ticket_comments tc
          LEFT JOIN users sender ON tc.sender_id = sender.id AND tc.sender_id != 0
          LEFT JOIN users receiver ON tc.receiver_id = receiver.id AND tc.receiver_id != 0
          WHERE tc.id = ? AND tc.deleted_at IS NULL`, 
          [result.insertId]
      );
      const key = `${ticket_id}_${receiver_id}`;

        const recipientSocketId = connectedUsers[key];
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('chat message', { ...resultData[0] });
          socket.emit('msg', 'Msg sended.');
        }
    } catch (error) {
        console.error('Error saving message:', error);
    }
});


  // Handle user disconnect
  socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      // Remove user from connected users
      Object.keys(connectedUsers).forEach((key) => {
          if (connectedUsers[key] === socket.id) {
              delete connectedUsers[key];
          }
      });
  });
});

// Socket-----------------------------------------------------------------------------
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} is not allowed by CORS`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'], 
  allowedHeaders: ['Content-Type', 'Authorization'], 
};



app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));
const apiRouter = express.Router();
app.use(fileUpload());
 
//authentication
apiRouter.post('/login', loginController.login);
apiRouter.post('/logout', loginController.logout);
apiRouter.put('/change_password/:id',RoleController.checkRole(),loginController.changePassword);
apiRouter.post('/forgot_password',loginController.forgotPassword);
apiRouter.post('/reset_password',loginController.reset_password);

// User Routes
apiRouter.post('/user',RoleController.checkRole(), userController.createUser);
apiRouter.put('/user/:id',RoleController.checkRole(), userController.updateUser);
apiRouter.delete('/user/:id',RoleController.checkRole(), userController.deleteUser);
apiRouter.get('/user/:id',RoleController.checkRole(), userController.getUser);
apiRouter.get('/user',RoleController.checkRole(), userController.getAllUsers);

// Product Routes
apiRouter.post('/products',RoleController.checkRole(), productController.createProduct);
apiRouter.put('/products/:id',RoleController.checkRole(), productController.updateProduct);
apiRouter.delete('/products/:id',RoleController.checkRole(), productController.deleteProduct);
apiRouter.get('/products/:id',RoleController.checkRole(), productController.getProduct);
apiRouter.get('/products',RoleController.checkRole(), productController.getAllProducts);

// Project Routes
apiRouter.post('/projects',RoleController.checkRole(), projectController.createProject);
apiRouter.put('/projects/:id',RoleController.checkRole(), projectController.updateProject);
apiRouter.delete('/projects/:id',RoleController.checkRole(), projectController.deleteProject);
apiRouter.get('/projects/:id',RoleController.checkRole(), projectController.getProject);
apiRouter.get('/projects',RoleController.checkRole(), projectController.getAllProjects);
apiRouter.get('/project_status', projectController.project_status);
apiRouter.get('/project_request',RoleController.checkRole(), projectController.project_request);
apiRouter.get('/project_requestupdate',RoleController.checkRole(), projectController.project_requestupdate);
apiRouter.put('/project_requestchange/:id',RoleController.checkRole(), projectController.project_requestchange);

// Team Routes
apiRouter.post('/team',RoleController.checkRole(), teamController.createTeam);
apiRouter.put('/team/:id',RoleController.checkRole(), teamController.updateTeam);
apiRouter.delete('/team/:id',RoleController.checkRole(), teamController.deleteTeam);
apiRouter.get('/team/:id',RoleController.checkRole(), teamController.getTeam);
apiRouter.get('/team',RoleController.checkRole(), teamController.getAllTeams);

// Designation Routes
apiRouter.post('/designations',RoleController.checkRole(), designationController.createDesignation);
apiRouter.put('/designations/:id',RoleController.checkRole(), designationController.updateDesignation);
apiRouter.delete('/designations/:id',RoleController.checkRole(), designationController.deleteDesignation);
apiRouter.get('/designations/:id',RoleController.checkRole(), designationController.getDesignation);
apiRouter.get('/designations',RoleController.checkRole(), designationController.getAllDesignations);


// Task Routes
apiRouter.post('/task', RoleController.checkRole(),taskController.createTask);
apiRouter.put('/task/:id',RoleController.checkRole(), taskController.updateTask);
apiRouter.delete('/task/:id', RoleController.checkRole(),taskController.deleteTask);
apiRouter.get('/task/:id',RoleController.checkRole(), taskController.getTask);
apiRouter.get('/task', RoleController.checkRole(),taskController.getAllTasks);
apiRouter.put('/taskupdate/:id',RoleController.checkRole(), taskController.updateDatas);
apiRouter.get('/getTaskDatas',RoleController.checkRole(), taskController.getTaskDatas);
apiRouter.get('/doneTask',RoleController.checkRole(), taskController.doneTask);
apiRouter.post('/updateTaskTimeLineStatus',RoleController.checkRole(), taskController.updateTaskTimeLineStatus);
apiRouter.get('/getWorkReport', RoleController.checkRole(),taskController.workReport);
apiRouter.get('/deletedTaskList', RoleController.checkRole(),taskController.deletedTaskList);
apiRouter.post('/restoreTasks', RoleController.checkRole(),taskController.taskRestore);

// Subtask Routes
apiRouter.post('/subtask', RoleController.checkRole(),subtaskController.createSubTask);
apiRouter.put('/subtask/:id',RoleController.checkRole(), subtaskController.updateSubTask);
apiRouter.delete('/subtask/:id', RoleController.checkRole(),subtaskController.deleteSubTask);
apiRouter.get('/subtask/:id', RoleController.checkRole(),subtaskController.getSubTask);
apiRouter.get('/subtask',RoleController.checkRole(), subtaskController.getAllSubTasks);
apiRouter.put('/subtaskupdate/:id',RoleController.checkRole(), subtaskController.updateDatas);



// Idle Employee Route
apiRouter.get('/idleEmployee', RoleController.checkRole(),idleEmployeeController.get_idleEmployee);

// PM Dashboard Routes
apiRouter.get('/pmproducts',RoleController.checkRole(), pmdashboardController.pmproductsection);
apiRouter.get('/pmutilization',RoleController.checkRole(), pmdashboardController.pmutilizationsection);
apiRouter.get('/pmattendance',RoleController.checkRole(), pmdashboardController.pmattendancesection);
apiRouter.get('/pmdashboard',RoleController.checkRole(), pmdashboardController.pmdashboardsection);
apiRouter.get('/pmviewproduct',RoleController.checkRole(), pmdashboardController.pmviewproductsection);

// TL Dashboard Routes
apiRouter.get('/tlattendance',RoleController.checkRole(), tldashboardController.tlattendancesection);
apiRouter.get('/tlrating',RoleController.checkRole(), tldashboardController.tlratingsection);
apiRouter.get('/tlproducts',RoleController.checkRole(), tldashboardController.tlproductsection);
apiRouter.get('/tlresourceallotment',RoleController.checkRole(), tldashboardController.tlresourceallotmentsection);
apiRouter.get('/tldashboard',RoleController.checkRole(), tldashboardController.tldashboardsection);
apiRouter.get('/tlviewproduct',RoleController.checkRole(), tldashboardController.tlviewproductsection);

// Employee Dashboard Routes
apiRouter.get('/emppendingtask',RoleController.checkRole(), empdashboardController.emppendingtasksection);
apiRouter.get('/empdailybreakdown',RoleController.checkRole(), empdashboardController.empdailybreakdownsection);
apiRouter.get('/empstatistics',RoleController.checkRole(), empdashboardController.empstatisticssection);
apiRouter.get('/empstatisticschart',RoleController.checkRole(), empdashboardController.empstatisticschartsection);
apiRouter.get('/empratings',RoleController.checkRole(), empdashboardController.empratingsection);

// Productivity
apiRouter.get('/teamwise_productivity', RoleController.checkRole(),productivityController.get_teamwiseProductivity);
apiRouter.get('/individual_status', RoleController.checkRole(),productivityController.get_individualProductivity);

//Rating
apiRouter.get('/getAnnualRatings', RoleController.checkRole(),ratingController.getAnnualRatings);
apiRouter.get('/getAllRatings', RoleController.checkRole(),ratingController.getAllRatings);
apiRouter.post('/ratingUpdation', RoleController.checkRole(), ratingController.ratingUpdation);

//phase -2
apiRouter.post('/updateRating', RoleController.checkRole(), ratingController.ratingUpdations);
apiRouter.get('/getRating', RoleController.checkRole(), ratingController.getRating);
apiRouter.get('/getAllUserRating', RoleController.checkRole(), ratingController.getAllUserRating);
apiRouter.get('/getAnnualRatings', RoleController.checkRole(),ratingController.getAnnualRatings);

//Attendance
apiRouter.get('/getAttendanceList', RoleController.checkRole(), attendanceController.getAttendanceList);
apiRouter.post('/updateAttendance', RoleController.checkRole(), attendanceController.updateAttendance);
apiRouter.get('/getAttendanceReport', RoleController.checkRole(), attendanceController.getAttendanceListReport);


// Comments
apiRouter.post('/comments',RoleController.checkRole(),commentsController. addComments);
apiRouter.put('/comments/:id',RoleController.checkRole(),commentsController. updateComments);
apiRouter.delete('/comments',RoleController.checkRole(),commentsController. deleteComments);

//tickets
apiRouter.get('/tickets',RoleController.checkRole(),ticketsController. getAlltickets);
apiRouter.get('/tickets/:id',RoleController.checkRole(),ticketsController. getTickets);
apiRouter.post('/tickets',RoleController.checkRole(),ticketsController.createTicket);
apiRouter.put('/tickets/:id',RoleController.checkRole(),ticketsController. updateTickets);
apiRouter.post('/ticket-comments',RoleController.checkRole(),(req, res) => ticketsController.ticketComments(req, res, wss));

 //apiRouter.delete('/tickets/:id',RoleController.checkRole(),ticketsController. deleteTickets);

// OT Details
apiRouter.post('/otdetail', RoleController.checkRole(),otdetailController.createOtdetail);
apiRouter.put('/otdetail/:id',RoleController.checkRole(), otdetailController.updateOtdetail);
apiRouter.delete('/otdetail/:id', RoleController.checkRole(),otdetailController.deleteOtdetail);
apiRouter.get('/otdetail/:id', RoleController.checkRole(),otdetailController.getOtdetail);
apiRouter.get('/otdetail',RoleController.checkRole(), otdetailController.getAllOtdetails);
apiRouter.get('/pmemployeeotdetail',RoleController.checkRole(), otdetailController.getAllpmemployeeOtdetails);
apiRouter.get('/tlemployeeotdetail',RoleController.checkRole(), otdetailController.getAlltlemployeeOtdetails);
apiRouter.put('/tlotdetail/:id',RoleController.checkRole(), otdetailController.updatetlOtdetail);
apiRouter.post('/approve_reject_ot', RoleController.checkRole(),otdetailController.approve_reject_otdetail);
apiRouter.get('/getOtReport', RoleController.checkRole(),otdetailController.getOtReport);


// Expense
apiRouter.post('/expensedetail', RoleController.checkRole(),expensedetailController.createexpensedetail);
apiRouter.get('/expensedetail/:id', RoleController.checkRole(),expensedetailController.getexpensedetail);
apiRouter.put('/expensedetail/:id',RoleController.checkRole(), expensedetailController.updateexpensedetail);
apiRouter.delete('/expensedetail/:id', RoleController.checkRole(),expensedetailController.deleteexpensedetail);
apiRouter.get('/expensedetail',RoleController.checkRole(), expensedetailController.getAllexpensedetails);
apiRouter.get('/pmemployeeexpensedetail',RoleController.checkRole(), expensedetailController.getAllpmemployeeexpensedetails);
apiRouter.get('/tlemployeeexpensedetail',RoleController.checkRole(), expensedetailController.getAlltlemployeexpensedetails);
apiRouter.get('/getExpenseReport',RoleController.checkRole(), expensedetailController.getExpenseReports);
apiRouter.post('/approve_reject_expense', RoleController.checkRole(),expensedetailController.approve_reject_expensedetail);


//common
apiRouter.get('/getDropDownList',RoleController.checkRole(),commonController.getDropDownList);

//reports
apiRouter.get('/getTimeReport', RoleController.checkRole(), reportController.getTimeListReport);


// Use `/api` as a common prefix
app.use('/api', apiRouter);

app.use(globalErrorHandler);


if (isProduction) {

  server.listen(PORT, () => {
    console.log(`Secure server is running on https://${DOMAIN}:${PORT}`);
  });
} else {
  // Development server (non-SSL)
  server.listen(PORT, () => {
    console.log(`Development server is running on http://${DOMAIN}:${PORT}`);
  });
}
