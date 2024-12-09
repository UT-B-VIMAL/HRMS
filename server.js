// server.js
const express = require("express");
const bodyParser = require("./middleware/bodyParser");
const globalErrorHandler = require("./middleware/errorHandler");
const userController = require('./controllers/userController');
const productController= require('./controllers/productController');
const taskController = require('./controllers/taskController');
const subtaskController = require('./controllers/subtaskcontroller');
const idleEmployeeController = require('./controllers/idleEmployeeController');
const pmdashboardController = require('./controllers/pmController');
const productivityController = require('./controllers/productivityController');
const tldashboardController = require('./controllers/tldashboardController');
const authController = require('./controllers/authController')

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
apiRouter.get('/products', productController.getAll);
apiRouter.get('/products/:id', productController.find);
apiRouter.put('/products/:id', productController.update);
apiRouter.delete('/products/:id', productController.delete);

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
apiRouter.get('/tlattendance', tldashboardController.tlattendancesection);

// Productivity
apiRouter.get('/teamwise_productivity', productivityController.get_teamwiseProductivity);
apiRouter.get('/individual_status', productivityController.get_individualProductivity);


// Change password

apiRouter.post('/change_password',authController.change_password);

// Use `/api` as a common prefix
app.use('/api', apiRouter);

app.use(globalErrorHandler);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
