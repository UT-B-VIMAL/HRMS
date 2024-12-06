// server.js
const express = require("express");
const userRoutes = require("./routes/userRoutes");
const productRoutes = require("./routes/productRoutes");
const projectRoutes = require("./routes/projectRoutes");
const teamsRoutes = require("./routes/teamRoutes");
const designationRoutes = require("./routes/designationRoutes");
const bodyParser = require("./middleware/bodyParser");
const globalErrorHandler = require("./middleware/errorHandler");

const app = express();

app.use(bodyParser);

app.use("/api/users", userRoutes);
app.use("/api/", productRoutes);
app.use("/api/", projectRoutes);
app.use("/api/", teamsRoutes);
app.use("/api/", designationRoutes);

app.use(globalErrorHandler);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
