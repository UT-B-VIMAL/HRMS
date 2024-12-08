const express = require("express");
const https = require("https");
const http = require("http");
const fs = require("fs");
const bodyParser = require("./middleware/bodyParser");
const globalErrorHandler = require("./middleware/errorHandler");
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

const tldashboardController = require('./controllers/tldashboardController');
const authController = require('./controllers/authController');

const app = express();
app.use(bodyParser);

const apiRouter = express.Router();

// User Routes
apiRouter.post('/user', userController.createUser);
apiRouter.put('/user/:id', userController.updateUser);
apiRouter.delete('/user/:id', userController.deleteUser);
apiRouter.get('/user/:id', userController.getUser);
apiRouter.get('/user', userController.getAllUsers);

// Product Routes
apiRouter.post('/products', productController.insert);
apiRouter.put('/products/:id', productController.update);
apiRouter.delete('/products/:id', productController.delete);
apiRouter.get('/products/:id', productController.find);
apiRouter.get('/products', productController.getAll);

// Project Routes
apiRouter.post('/projects', projectController.insert);
apiRouter.put('/projects/:id', projectController.update);
apiRouter.delete('/projects/:id', projectController.delete);
apiRouter.get('/projects/:id', projectController.find);
apiRouter.get('/projects', projectController.getAll);

// Team Routes
apiRouter.post('/team', teamController.insert);
apiRouter.put('/team/:id', teamController.update);
apiRouter.delete('/team/:id', teamController.delete);
apiRouter.get('/team/:id', teamController.find);
apiRouter.get('/team', teamController.getAll);

// Designation Routes
apiRouter.post('/designations', designationController.insert);
apiRouter.put('/designations/:id', designationController.update);
apiRouter.delete('/designations/:id', designationController.delete);
apiRouter.get('/designations/:id', designationController.find);
apiRouter.get('/designations', designationController.getAll);


// Task Routes
apiRouter.post('/task', taskController.createTask);
apiRouter.put('/task/:id', taskController.updateTask);
apiRouter.delete('/task/:id', taskController.deleteTask);
apiRouter.get('/task/:id', taskController.getTask);
apiRouter.get('/task', taskController.getAllTasks);

// Subtask Routes
apiRouter.post('/subtask', subtaskController.createSubTask);
apiRouter.put('/subtask/:id', subtaskController.updateSubTask);
apiRouter.delete('/subtask/:id', subtaskController.deleteSubTask);
apiRouter.get('/subtask/:id', subtaskController.getSubTask);
apiRouter.get('/subtask', subtaskController.getAllSubTasks);

// Idle Employee Route
apiRouter.get('/idleEmployee', idleEmployeeController.get_idleEmployee);

// PM Dashboard Routes
apiRouter.get('/pmproducts', pmdashboardController.pmproductsection);
apiRouter.get('/pmutilization', pmdashboardController.pmutilizationsection);
apiRouter.get('/pmattendance', pmdashboardController.pmattendancesection);
apiRouter.get('/pmdashboard', pmdashboardController.pmdashboardsection);
apiRouter.get('/pmviewproduct', pmdashboardController.pmviewproductsection);

// TL Dashboard Routes
apiRouter.get('/pmlist', tldashboardController.tlattendancesection);
apiRouter.get('/tlattendance', tldashboardController.tlattendancesection);

// Productivity
apiRouter.get('/teamwise_productivity', productivityController.get_teamwiseProductivity);
apiRouter.get('/individual_status', productivityController.get_individualProductivity);
apiRouter.get('/getAllRatings', ratingController.getAllRatings);
apiRouter.post('/ratingUpdation', ratingController.ratingUpdation);

// Change password

apiRouter.put('/change_password/:id',authController.change_password);

// Use `/api` as a common prefix
app.use('/api', apiRouter);

app.use(globalErrorHandler);

// Define the server configuration
const isProduction = fs.existsSync("/etc/letsencrypt/archive/frontendnode.hrms.utwebapps.com/privkey1.pem");
const DOMAIN = isProduction ? "frontendnode.hrms.utwebapps.com" : "localhost";
const PORT = isProduction ? 9000 : 3000;

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
