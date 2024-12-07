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

const app = express();
app.use(bodyParser);

//User
app.post('/user', userController.createUser);
app.put('/user/:id', userController.updateUser);
app.delete('/user/:id', userController.deleteUser);
app.get('/user/:id', userController.getUser);
app.get('/user', userController.getAllUsers);

//Product
app.get("/products", productController.getAll);
app.get("/products/:id", productController.find);
app.put("/products/:id", productController.update);
app.delete("/products/:id", productController.delete);

//Task 
app.post('/task', taskController.createTask);   
app.put('/task/:id', taskController.updateTask);     
app.delete('/task/:id', taskController.deleteTask);
app.get('/task/:id', taskController.getTask);   
app.get('/task', taskController.getAllTasks); 

//Subtask 
app.post('/subtask', subtaskController.createSubTask);   
app.put('/subtask/:id', subtaskController.updateSubTask);     
app.delete('/subtask/:id', subtaskController.deleteSubTask);
app.get('/subtask/:id', subtaskController.getSubTask);   
app.get('/subtask', subtaskController.getAllSubTasks);

//Idle Employee
app.get('/idleEmployee', idleEmployeeController.get_idleEmployee);


// PM Dashboard
app.get('/pmproducts', pmdashboardController.pmproductsection);
app.get('/pmutilization', pmdashboardController.pmutilizationsection);
app.get('/pmattendance', pmdashboardController.pmattendancesection);
app.get('/pmdashboard', pmdashboardController.pmdashboardsection);


app.use(globalErrorHandler);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
