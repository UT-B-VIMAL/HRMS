const { getAllRatings, updateRating, getRatings, getRatingById, ratingUpdation, getAnnualRatings } = require("../api/functions/ratingFunction");
const { successResponse, errorResponse } = require("../helpers/responseHelper");






exports.ratingUpdations = async (req, res) => {
  try {
    const payload = req.body;
    await ratingUpdation(payload,res,req);
  } catch (error) {
    const statusCode = error.status || 500;
    return errorResponse(res, error.message, "Error updating rating", statusCode);
  }
}
exports.getRating = async (req, res) => {
  try {
    const reqbody = req.body;
    await getRatingById(reqbody,res);
  
  } catch (error) {
    const statusCode = error.status || 500;
    return errorResponse(res, error.message, "Error fetching ratings", statusCode);
  }
};
exports.getAllUserRating = async (req, res) => {
  try {
    await getRatings(req,res);
  
  } catch (error) {
    const statusCode = error.status || 500;
    return errorResponse(res, error.message, "Error fetching ratings", statusCode);
  }
};
exports.getAnnualRatings = async (req, res) => {
  try {
    await getAnnualRatings(req,res);
  } catch (error) {
    const statusCode = error.status || 500;
    return errorResponse(res, error.message, "Error fetching ratings", statusCode);
  }
};