// server.js
const express = require("express");
const bodyParser = require("./middleware/bodyParser");
const globalErrorHandler = require("./middleware/errorHandler");
const userRoutes = require("./routes/userRoutes");
const taskRoutes = require("./routes/taskRoutes");
const subtaskRoutes = require("./routes/subtaskRoutes");
const productRoutes = require("./routes/productRoutes");
const projectRoutes = require("./routes/projectRoutes");
const teamsRoutes = require("./routes/teamRoutes");
const designationRoutes = require("./routes/designationRoutes");

const app = express();

app.use(bodyParser);

app.use("/api/users", userRoutes);
app.use("/api/", productRoutes);
app.use("/api/", projectRoutes);
app.use("/api/", teamsRoutes);
app.use("/api/", designationRoutes);
app.use("/api/", taskRoutes);
app.use("/api/", subtaskRoutes);

app.use(globalErrorHandler);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
