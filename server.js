const express = require("express");
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
const otdetailController = require('./controllers/otdetailController');
// const ticketsController =require('./controllers/ticketsController');

const app = express();
const isProduction = fs.existsSync("/etc/letsencrypt/archive/frontendnode.hrms.utwebapps.com/privkey1.pem");
const DOMAIN = isProduction ? "frontendnode.hrms.utwebapps.com" : "localhost";
const PORT = isProduction ? 8085 : 3000;

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
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // Specify allowed HTTP methods
  allowedHeaders: ['Content-Type', 'Authorization'], // Specify allowed headers
};



app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(bodyParser);

// Allow requests from localhost:5173


const apiRouter = express.Router();

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
apiRouter.get('/project_request',RoleController.checkRole(['pm','admin']), projectController.project_request);
apiRouter.get('/project_requestupdate',RoleController.checkRole(['pm','admin']), projectController.project_requestupdate);
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
apiRouter.post('/task', RoleController.checkRole(['tl','pm','admin']),taskController.createTask);
apiRouter.put('/task/:id',RoleController.checkRole(['tl','pm','admin']), taskController.updateTask);
apiRouter.delete('/task/:id', RoleController.checkRole(['tl','pm','admin']),taskController.deleteTask);
apiRouter.get('/task/:id',RoleController.checkRole(['tl','pm','admin']), taskController.getTask);
apiRouter.get('/task', RoleController.checkRole(['tl','pm','admin']),taskController.getAllTasks);
apiRouter.put('/taskupdate/:id',RoleController.checkRole(['tl','pm','admin']), taskController.updateDatas);
apiRouter.get('/getTaskDatas',RoleController.checkRole(['pm','admin','tl','employee']), taskController.getTaskDatas);
apiRouter.get('/doneTask',RoleController.checkRole(['tl','pm','admin','employee']), taskController.doneTask);
apiRouter.get('/deletedTaskList',RoleController.checkRole(['pm','admin']), taskController.deletedTaskList);
apiRouter.post('/updateTaskTimeLineStatus',RoleController.checkRole(['admin','employee']), taskController.updateTaskTimeLineStatus);
apiRouter.post('/restoreTasks',RoleController.checkRole(['admin','pm']), taskController.taskRestore);


// Subtask Routes
apiRouter.post('/subtask', RoleController.checkRole(['tl','pm','admin']),subtaskController.createSubTask);
apiRouter.put('/subtask/:id',RoleController.checkRole(['tl','pm','admin']), subtaskController.updateSubTask);
apiRouter.delete('/subtask/:id', RoleController.checkRole(['tl','pm','admin']),subtaskController.deleteSubTask);
apiRouter.get('/subtask/:id', RoleController.checkRole(['tl','pm','admin']),subtaskController.getSubTask);
apiRouter.get('/subtask',RoleController.checkRole(['tl','pm','admin']), subtaskController.getAllSubTasks);
apiRouter.put('/subtaskupdate/:id',RoleController.checkRole(['tl','pm','admin']), subtaskController.updateDatas);



// Idle Employee Route
apiRouter.get('/idleEmployee', RoleController.checkRole(['tl','pm','admin']),idleEmployeeController.get_idleEmployee);

// PM Dashboard Routes
apiRouter.get('/pmproducts',RoleController.checkRole(['pm','admin']), pmdashboardController.pmproductsection);
apiRouter.get('/pmutilization',RoleController.checkRole(['pm','admin']), pmdashboardController.pmutilizationsection);
apiRouter.get('/pmattendance',RoleController.checkRole(['pm','admin']), pmdashboardController.pmattendancesection);
apiRouter.get('/pmdashboard',RoleController.checkRole(['pm','admin']), pmdashboardController.pmdashboardsection);
apiRouter.get('/pmviewproduct',RoleController.checkRole(['pm','admin']), pmdashboardController.pmviewproductsection);

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
apiRouter.get('/getAllRatings', RoleController.checkRole(['pm','admin']),ratingController.getAllRatings);
apiRouter.post('/ratingUpdation', RoleController.checkRole(['pm','admin']), ratingController.ratingUpdation);

//Attendance
apiRouter.get('/getAttendanceList', RoleController.checkRole(['tl','admin']), attendanceController.getAttendanceList);
apiRouter.post('/updateAttendance', RoleController.checkRole(['tl','admin']), attendanceController.updateAttendance);


// Comments
apiRouter.post('/comments',RoleController.checkRole(['tl','pm','admin','employee']),commentsController. addComments);
apiRouter.put('/comments/:id',RoleController.checkRole(['tl','pm','admin','employee']),commentsController. updateComments);
apiRouter.delete('/comments/:id',RoleController.checkRole(['tl','pm','admin','employee']),commentsController. deleteComments);

//tickets
// apiRouter.get('/tickets',RoleController.checkRole(['tl','pm','admin','employee']),ticketsController. getAlltickets);
// apiRouter.get('/tickets/:id',RoleController.checkRole(['tl','pm','admin','employee']),ticketsController. getTickets);
// apiRouter.post('/tickets',RoleController.checkRole(['tl','pm','admin','employee']),ticketsController. addTickets);
// apiRouter.put('/tickets/:id',RoleController.checkRole(['tl','pm','admin','employee']),ticketsController. updateTickets);
// apiRouter.delete('/tickets/:id',RoleController.checkRole(['tl','pm','admin','employee']),ticketsController. deleteTickets);

// OT Details
apiRouter.post('/otdetail', RoleController.checkRole(['tl','pm','admin','employee']),otdetailController.createOtdetail);
apiRouter.put('/otdetail/:id',RoleController.checkRole(['tl','pm','admin','employee']), otdetailController.updateOtdetail);
apiRouter.delete('/otdetail/:id', RoleController.checkRole(['tl','pm','admin','employee']),otdetailController.deleteOtdetail);
apiRouter.get('/otdetail/:id', RoleController.checkRole(['tl','pm','admin','employee']),otdetailController.getOtdetail);
apiRouter.get('/otdetail',RoleController.checkRole(['tl','pm','admin','employee']), otdetailController.getAllOtdetails);

//common
apiRouter.get('/getDropDownList',RoleController.checkRole(['tl','pm','admin','employee']),commonController.getDropDownList);


// Use `/api` as a common prefix
app.use('/api', apiRouter);

app.use(globalErrorHandler);


if (isProduction) {
  // SSL Configuration for production
  const options = {
    key: fs.readFileSync("/etc/letsencrypt/archive/frontendnode.hrms.utwebapps.com/privkey1.pem"),
    cert: fs.readFileSync("/etc/letsencrypt/archive/frontendnode.hrms.utwebapps.com/cert1.pem"),
  };

  https.createServer(options, app).listen(PORT, () => {
    console.log(`Secure server is running on https://${DOMAIN}:${PORT}`);
  });
} else {
  // Development server (non-SSL)
  http.createServer(app).listen(PORT, () => {
    console.log(`Development server is running on http://${DOMAIN}:${PORT}`);
  });
}
