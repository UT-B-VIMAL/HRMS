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


const app = express();
const isProduction = fs.existsSync("/etc/letsencrypt/archive/frontendnode.hrms.utwebapps.com/privkey1.pem");
const DOMAIN = isProduction ? "frontendnode.hrms.utwebapps.com" : "localhost";
const PORT = isProduction ? 9000 : 3000;

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:81',
      'http://localhost', 
      'http://frontend.utwebapps.com', 
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
apiRouter.put('/change_password/:id',loginController.changePassword);

// User Routes
apiRouter.post('/user',RoleController.checkRole(['admin','tl','pm']), userController.createUser);
apiRouter.put('/user/:id',RoleController.checkRole(['admin','tl','pm']), userController.updateUser);
apiRouter.delete('/user/:id',RoleController.checkRole(['admin','tl','pm']), userController.deleteUser);
apiRouter.get('/user/:id',RoleController.checkRole(['admin','tl','pm']), userController.getUser);
apiRouter.get('/user',RoleController.checkRole(['admin','tl','pm']), userController.getAllUsers);

// Product Routes
apiRouter.post('/products', productController.createProduct);
apiRouter.put('/products/:id', productController.updateProduct);
apiRouter.delete('/products/:id', productController.deleteProduct);
apiRouter.get('/products/:id', productController.getProduct);
apiRouter.get('/products', productController.getAllProducts);

// Project Routes
apiRouter.post('/projects', projectController.createProject);
apiRouter.put('/projects/:id', projectController.updateProject);
apiRouter.delete('/projects/:id', projectController.deleteProject);
apiRouter.get('/projects/:id', projectController.getProject);
apiRouter.get('/projects', projectController.getAllProjects);
apiRouter.get('/project_status', projectController.project_status);
apiRouter.get('/project_request',RoleController.checkRole(['pm','admin']), projectController.project_request);
apiRouter.get('/project_requestupdate',RoleController.checkRole(['pm','admin']), projectController.project_requestupdate);
apiRouter.put('/project_requestchange/:id',RoleController.checkRole(['pm','admin']), projectController.project_requestchange);

// Team Routes
apiRouter.post('/team', teamController.createTeam);
apiRouter.put('/team/:id', teamController.updateTeam);
apiRouter.delete('/team/:id', teamController.deleteTeam);
apiRouter.get('/team/:id', teamController.getTeam);
apiRouter.get('/team', teamController.getAllTeams);

// Designation Routes
apiRouter.post('/designations', designationController.createDesignation);
apiRouter.put('/designations/:id', designationController.updateDesignation);
apiRouter.delete('/designations/:id', designationController.deleteDesignation);
apiRouter.get('/designations/:id', designationController.getDesignation);
apiRouter.get('/designations', designationController.getAllDesignations);


// Task Routes
apiRouter.post('/task', taskController.createTask);
apiRouter.put('/task/:id', taskController.updateTask);
apiRouter.delete('/task/:id', taskController.deleteTask);
apiRouter.get('/task/:id', taskController.getTask);
apiRouter.get('/task', taskController.getAllTasks);
apiRouter.put('/taskupdate/:id', taskController.updateDatas);
apiRouter.get('/getTaskDatas', taskController.getTaskDatas);


// Subtask Routes
apiRouter.post('/subtask', subtaskController.createSubTask);
apiRouter.put('/subtask/:id', subtaskController.updateSubTask);
apiRouter.delete('/subtask/:id', subtaskController.deleteSubTask);
apiRouter.get('/subtask/:id', subtaskController.getSubTask);
apiRouter.get('/subtask', subtaskController.getAllSubTasks);
apiRouter.put('/subtaskupdate/:id', subtaskController.updateDatas);



// Idle Employee Route
apiRouter.get('/idleEmployee', idleEmployeeController.get_idleEmployee);

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
apiRouter.get('/teamwise_productivity', productivityController.get_teamwiseProductivity);
apiRouter.get('/individual_status', productivityController.get_individualProductivity);

//Rating
apiRouter.get('/getAllRatings', ratingController.getAllRatings);
apiRouter.post('/ratingUpdation', ratingController.ratingUpdation);

//Attendance
apiRouter.get('/getAttendanceList', attendanceController.getAttendanceList);
apiRouter.post('/updateAttendance', attendanceController.updateAttendance);


// Comments
apiRouter.post('/comments',commentsController. addComments);
apiRouter.put('/comments/:id',commentsController. updateComments);
apiRouter.delete('/comments/:id',commentsController. deleteComments);




//common
apiRouter.get('/getDropDownList',commonController.getDropDownList);


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
