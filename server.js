const express = require("express");
const fileUpload = require("express-fileupload");
const https = require("https");
const http = require("http");
const fs = require("fs");
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
const isProduction = fs.existsSync("/etc/letsencrypt/archive/frontendnode.hrms.utwebapps.com/privkey1.pem");
const DOMAIN = isProduction ? "frontendnode.hrms.utwebapps.com" : "localhost";
const PORT = isProduction ? 8085 : 3000;


// Socket-----------------------------------------------------------------------------
const socketIo = require('socket.io');

let server;

if (isProduction) {
  const options = {
    key: fs.readFileSync("/etc/letsencrypt/archive/frontendnode.hrms.utwebapps.com/privkey1.pem"),
    cert: fs.readFileSync("/etc/letsencrypt/archive/frontendnode.hrms.utwebapps.com/cert1.pem"),
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
app.use(express.static('public'));
const connectedUsers = {}; 

io.on('connection', (socket) => {
  console.log('Connected User:', socket.id);


  socket.on('register', async (id) => {
    console.log('Received user ID:', id); 
    
    try {
      const [results] = await db.execute('SELECT id FROM users WHERE id = ?', [id]);
      if (results.length > 0) {
        connectedUsers[id] = socket.id;
        console.log(`User ${id} registered with socket ID ${socket.id}`);
      } else {
        console.log(`User ID ${id} not found.`);
      }
    } catch (err) {
      console.error('Error fetching user:', err);
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
                  CONCAT(COALESCE(sender.first_name, ''), ' ', COALESCE(NULLIF(sender.last_name, ''), '')) AS sender_name,
                  CONCAT(COALESCE(receiver.first_name, ''), ' ', COALESCE(NULLIF(receiver.last_name, ''), '')) AS receiver_name,
                  tc.created_at
              FROM ticket_comments tc
              JOIN users sender ON tc.sender_id = sender.id
              JOIN users receiver ON tc.receiver_id = receiver.id
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

        const recipientSocketId = connectedUsers[receiver_id];
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('chat message', { ticket_id, sender_id, comments });
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
const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:81',
      'http://localhost', 
      'http://frontend.utwebapps.com',
      'https://main.detwo6merrv1m.amplifyapp.com' 
    ];
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
apiRouter.put('/change_password/:id',RoleController.checkRole(['pm','admin','tl','employee']),loginController.changePassword);
apiRouter.post('/forgot_password',loginController.forgotPassword);
apiRouter.post('/reset_password',loginController.reset_password);

// User Routes
apiRouter.post('/user',RoleController.checkRole(['admin','tl','pm']), userController.createUser);
apiRouter.put('/user/:id',RoleController.checkRole(['admin','tl','pm']), userController.updateUser);
apiRouter.delete('/user/:id',RoleController.checkRole(['admin','tl','pm']), userController.deleteUser);
apiRouter.get('/user/:id',RoleController.checkRole(['admin','tl','pm']), userController.getUser);
apiRouter.get('/user',RoleController.checkRole(['admin','tl','pm']), userController.getAllUsers);

// Product Routes
apiRouter.post('/products',RoleController.checkRole(['pm','admin']), productController.createProduct);
apiRouter.put('/products/:id',RoleController.checkRole(['pm','admin']), productController.updateProduct);
apiRouter.delete('/products/:id',RoleController.checkRole(['pm','admin']), productController.deleteProduct);
apiRouter.get('/products/:id',RoleController.checkRole(['pm','admin']), productController.getProduct);
apiRouter.get('/products',RoleController.checkRole(['pm','admin']), productController.getAllProducts);

// Project Routes
apiRouter.post('/projects',RoleController.checkRole(['pm','admin']), projectController.createProject);
apiRouter.put('/projects/:id',RoleController.checkRole(['pm','admin']), projectController.updateProject);
apiRouter.delete('/projects/:id',RoleController.checkRole(['pm','admin']), projectController.deleteProject);
apiRouter.get('/projects/:id',RoleController.checkRole(['pm','admin']), projectController.getProject);
apiRouter.get('/projects',RoleController.checkRole(['pm','admin']), projectController.getAllProjects);
apiRouter.get('/project_status', projectController.project_status);
apiRouter.get('/project_request',RoleController.checkRole(['pm','tl','admin']), projectController.project_request);
apiRouter.get('/project_requestupdate',RoleController.checkRole(['pm','tl','admin']), projectController.project_requestupdate);
apiRouter.put('/project_requestchange/:id',RoleController.checkRole(['pm','admin']), projectController.project_requestchange);

// Team Routes
apiRouter.post('/team',RoleController.checkRole(['pm','admin']), teamController.createTeam);
apiRouter.put('/team/:id',RoleController.checkRole(['pm','admin']), teamController.updateTeam);
apiRouter.delete('/team/:id',RoleController.checkRole(['pm','admin']), teamController.deleteTeam);
apiRouter.get('/team/:id',RoleController.checkRole(['pm','admin']), teamController.getTeam);
apiRouter.get('/team',RoleController.checkRole(['pm','admin']), teamController.getAllTeams);

// Designation Routes
apiRouter.post('/designations',RoleController.checkRole(['pm','admin']), designationController.createDesignation);
apiRouter.put('/designations/:id',RoleController.checkRole(['pm','admin']), designationController.updateDesignation);
apiRouter.delete('/designations/:id',RoleController.checkRole(['pm','admin']), designationController.deleteDesignation);
apiRouter.get('/designations/:id',RoleController.checkRole(['pm','admin']), designationController.getDesignation);
apiRouter.get('/designations',RoleController.checkRole(['pm','admin']), designationController.getAllDesignations);


// Task Routes
apiRouter.post('/task', RoleController.checkRole(['tl','pm','admin','employee']),taskController.createTask);
apiRouter.put('/task/:id',RoleController.checkRole(['tl','pm','admin','employee']), taskController.updateTask);
apiRouter.delete('/task/:id', RoleController.checkRole(['pm','admin']),taskController.deleteTask);
apiRouter.get('/task/:id',RoleController.checkRole(['tl','pm','admin','employee']), taskController.getTask);
apiRouter.get('/task', RoleController.checkRole(['tl','pm','admin','employee']),taskController.getAllTasks);
apiRouter.get('/deletedTaskList', RoleController.checkRole(['tl','pm','admin','employee']),taskController.deletedTaskList);
apiRouter.post('/restoreTasks', RoleController.checkRole(['pm','admin']),taskController.taskRestore);
apiRouter.put('/taskupdate/:id',RoleController.checkRole(['tl','pm','admin','employee']), taskController.updateDatas);
apiRouter.get('/getTaskDatas',RoleController.checkRole(['pm','admin','tl','employee']), taskController.getTaskDatas);
apiRouter.get('/doneTask',RoleController.checkRole(['tl','pm','admin','employee']), taskController.doneTask);
apiRouter.post('/updateTaskTimeLineStatus',RoleController.checkRole(['admin','employee']), taskController.updateTaskTimeLineStatus);
apiRouter.get('/getWorkReport',RoleController.checkRole(['pm','employee']), taskController.workReport);


// Subtask Routes
apiRouter.post('/subtask', RoleController.checkRole(['tl','pm','admin','employee']),subtaskController.createSubTask);
apiRouter.put('/subtask/:id',RoleController.checkRole(['tl','pm','admin']), subtaskController.updateSubTask);
apiRouter.delete('/subtask/:id', RoleController.checkRole(['pm','admin']),subtaskController.deleteSubTask);
apiRouter.get('/subtask/:id', RoleController.checkRole(['tl','pm','admin','employee']),subtaskController.getSubTask);
apiRouter.get('/subtask',RoleController.checkRole(['tl','pm','admin','employee']), subtaskController.getAllSubTasks);
apiRouter.put('/subtaskupdate/:id',RoleController.checkRole(['tl','pm','admin','employee']), subtaskController.updateDatas);



// Idle Employee Route
apiRouter.get('/idleEmployee', RoleController.checkRole(['tl','pm','admin']),idleEmployeeController.get_idleEmployee);

// PM Dashboard Routes
apiRouter.get('/pmproducts',RoleController.checkRole(['pm','admin']), pmdashboardController.pmproductsection);
apiRouter.get('/pmutilization',RoleController.checkRole(['pm','admin']), pmdashboardController.pmutilizationsection);
apiRouter.get('/pmattendance',RoleController.checkRole(['pm','admin']), pmdashboardController.pmattendancesection);
apiRouter.get('/pmdashboard',RoleController.checkRole(['pm','admin']), pmdashboardController.pmdashboardsection);
apiRouter.get('/pmviewproduct',RoleController.checkRole(['pm','tl','admin']), pmdashboardController.pmviewproductsection);

// TL Dashboard Routes
apiRouter.get('/tlattendance',RoleController.checkRole(['tl','pm','admin']), tldashboardController.tlattendancesection);
apiRouter.get('/tlrating',RoleController.checkRole(['tl','pm','admin']), tldashboardController.tlratingsection);
apiRouter.get('/tlproducts',RoleController.checkRole(['tl','pm','admin']), tldashboardController.tlproductsection);
apiRouter.get('/tlresourceallotment',RoleController.checkRole(['tl','pm','admin']), tldashboardController.tlresourceallotmentsection);
apiRouter.get('/tldashboard',RoleController.checkRole(['tl','pm','admin']), tldashboardController.tldashboardsection);
apiRouter.get('/tlviewproduct',RoleController.checkRole(['tl','pm','admin']), tldashboardController.tlviewproductsection);

// Employee Dashboard Routes
apiRouter.get('/emppendingtask',RoleController.checkRole(['tl','pm','admin','employee']), empdashboardController.emppendingtasksection);
apiRouter.get('/empdailybreakdown',RoleController.checkRole(['tl','pm','admin','employee']), empdashboardController.empdailybreakdownsection);
apiRouter.get('/empstatistics',RoleController.checkRole(['tl','pm','admin','employee']), empdashboardController.empstatisticssection);
apiRouter.get('/empstatisticschart',RoleController.checkRole(['tl','pm','admin','employee']), empdashboardController.empstatisticschartsection);
apiRouter.get('/empratings',RoleController.checkRole(['tl','pm','admin','employee']), empdashboardController.empratingsection);

// Productivity
apiRouter.get('/teamwise_productivity', RoleController.checkRole(['pm','admin']),productivityController.get_teamwiseProductivity);
apiRouter.get('/individual_status', RoleController.checkRole(['pm','admin']),productivityController.get_individualProductivity);

//Rating
apiRouter.get('/getAnnualRatings', RoleController.checkRole(['pm','tl','admin']),ratingController.getAnnualRatings);
apiRouter.get('/getAllRatings', RoleController.checkRole(['pm','admin']),ratingController.getAllRatings);
apiRouter.post('/ratingUpdation', RoleController.checkRole(['pm','admin']), ratingController.ratingUpdation);

//phase -2
apiRouter.post('/updateRating', RoleController.checkRole(['tl','pm','admin']), ratingController.ratingUpdations);
apiRouter.get('/getRating', RoleController.checkRole(['tl','pm','admin']), ratingController.getRating);
apiRouter.get('/getAllUserRating', RoleController.checkRole(['tl','pm','admin']), ratingController.getAllUserRating);
apiRouter.get('/getAnnualRatings', RoleController.checkRole(['pm','tl','admin']),ratingController.getAnnualRatings);

//Attendance
apiRouter.get('/getAttendanceList', RoleController.checkRole(['tl','admin']), attendanceController.getAttendanceList);
apiRouter.post('/updateAttendance', RoleController.checkRole(['tl','admin']), attendanceController.updateAttendance);
apiRouter.get('/getAttendanceReport', RoleController.checkRole(['tl','admin']), attendanceController.getAttendanceListReport);


// Comments
apiRouter.post('/comments',RoleController.checkRole(['tl','pm','admin','employee']),commentsController. addComments);
apiRouter.put('/comments/:id',RoleController.checkRole(['tl','pm','admin','employee']),commentsController. updateComments);
apiRouter.delete('/comments',RoleController.checkRole(['tl','pm','admin','employee']),commentsController. deleteComments);

//tickets
apiRouter.get('/tickets',RoleController.checkRole(['tl','pm','admin','employee']),ticketsController. getAlltickets);
apiRouter.get('/tickets/:id',RoleController.checkRole(['tl','pm','admin','employee']),ticketsController. getTickets);
apiRouter.post('/tickets',RoleController.checkRole(['tl','pm','admin','employee']),ticketsController.createTicket);
apiRouter.put('/tickets/:id',RoleController.checkRole(['tl','pm','admin','employee']),ticketsController. updateTickets);
apiRouter.post('/ticket-comments',RoleController.checkRole(['tl', 'pm', 'admin', 'employee']),(req, res) => ticketsController.ticketComments(req, res, wss));

 //apiRouter.delete('/tickets/:id',RoleController.checkRole(['tl','pm','admin','employee']),ticketsController. deleteTickets);

// OT Details
apiRouter.post('/otdetail', RoleController.checkRole(['tl','pm','admin','employee']),otdetailController.createOtdetail);
apiRouter.put('/otdetail/:id',RoleController.checkRole(['tl','pm','admin','employee']), otdetailController.updateOtdetail);
apiRouter.delete('/otdetail/:id', RoleController.checkRole(['tl','pm','admin','employee']),otdetailController.deleteOtdetail);
apiRouter.get('/otdetail/:id', RoleController.checkRole(['tl','pm','admin','employee']),otdetailController.getOtdetail);
apiRouter.get('/otdetail',RoleController.checkRole(['tl','pm','admin','employee']), otdetailController.getAllOtdetails);
apiRouter.get('/pmemployeeotdetail',RoleController.checkRole(['pm','admin']), otdetailController.getAllpmemployeeOtdetails);
apiRouter.get('/tlemployeeotdetail',RoleController.checkRole(['pm','tl','admin']), otdetailController.getAlltlemployeeOtdetails);
apiRouter.put('/tlotdetail/:id',RoleController.checkRole(['tl','pm','admin','employee']), otdetailController.updatetlOtdetail);
apiRouter.post('/approve_reject_ot', RoleController.checkRole(['pm','tl','admin']),otdetailController.approve_reject_otdetail);
apiRouter.get('/getOtReport', RoleController.checkRole(['pm','admin']),otdetailController.getOtReport);


// Expense
apiRouter.post('/expensedetail', RoleController.checkRole(['tl','pm','admin','employee']),expensedetailController.createexpensedetail);
apiRouter.get('/expensedetail/:id', RoleController.checkRole(['tl','pm','admin','employee']),expensedetailController.getexpensedetail);
apiRouter.put('/expensedetail/:id',RoleController.checkRole(['tl','pm','admin','employee']), expensedetailController.updateexpensedetail);
apiRouter.delete('/expensedetail/:id', RoleController.checkRole(['tl','pm','admin','employee']),expensedetailController.deleteexpensedetail);
apiRouter.get('/expensedetail',RoleController.checkRole(['tl','pm','admin','employee']), expensedetailController.getAllexpensedetails);
apiRouter.get('/pmemployeeexpensedetail',RoleController.checkRole(['pm','admin']), expensedetailController.getAllpmemployeeexpensedetails);
apiRouter.get('/tlemployeeexpensedetail',RoleController.checkRole(['pm','tl','admin']), expensedetailController.getAlltlemployeexpensedetails);
apiRouter.get('/getExpenseReport',RoleController.checkRole(['pm','admin']), expensedetailController.getExpenseReports);
apiRouter.post('/approve_reject_expense', RoleController.checkRole(['pm','tl','admin']),expensedetailController.approve_reject_expensedetail);


//common
apiRouter.get('/getDropDownList',RoleController.checkRole(['tl','pm','admin','employee']),commonController.getDropDownList);

//reports
apiRouter.get('/getTimeReport', RoleController.checkRole(['tl','admin']), reportController.getTimeListReport);


// Use `/api` as a common prefix
app.use('/api', apiRouter);

app.use(globalErrorHandler);


if (isProduction) {
  // SSL Configuration for production
  const options = {
    key: fs.readFileSync("/etc/letsencrypt/archive/frontendnode.hrms.utwebapps.com/privkey1.pem"),
    cert: fs.readFileSync("/etc/letsencrypt/archive/frontendnode.hrms.utwebapps.com/cert1.pem"),
  };

  server.listen(PORT, () => {
    console.log(`Secure server is running on https://${DOMAIN}:${PORT}`);
  });
} else {
  // Development server (non-SSL)
  server.listen(PORT, () => {
    console.log(`Development server is running on http://${DOMAIN}:${PORT}`);
  });
}
