// server.js
const express = require('express');
const userRoutes = require('./routes/userRoutes');
const userdashboardRoutes = require('./routes/pmdashboardRoutes');
const bodyParser = require('./middleware/bodyParser');
const globalErrorHandler = require('./middleware/errorHandler');

const app = express();

app.use(bodyParser);


app.use('/api/users', userRoutes);
app.use('/api/pmdashboard', userdashboardRoutes);


app.use(globalErrorHandler);


const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
