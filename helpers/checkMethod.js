// middleware/checkMethod.js
const { errorResponse } = require("./responseHelper");

module.exports = (req, res, next) => {
  // Check if the method is not POST
  if (req.method !== "POST") {
    return errorResponse(
      res,
      `Invalid HTTP Method: Use POST to create a product`,
      "Method Not Allowed",
      405
    );
  }
  // If the method is correct, pass control to the next handler (controller)
  next();
};
