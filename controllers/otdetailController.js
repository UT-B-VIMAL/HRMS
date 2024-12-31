const {
  createOt,
  updateOt,
  deleteOt,
  getOt,
  getAllOts,
} = require("../api/functions/otFunction");
const { successResponse, errorResponse } = require("../helpers/responseHelper");
const Joi = require("joi");
const { createOTSchema, updateOTSchema } = require("../validators/otValidator");

exports.createOtdetail = async (req, res) => {
  try {
    const payload = req.body;
    const { error } = createOTSchema.validate(payload, { abortEarly: false });

    if (error) {
      const errorMessages = error.details.reduce((acc, err) => {
        acc[err.path[0]] = err.message;
        return acc;
      }, {});

      return errorResponse(res, errorMessages, "Validation Error", 403);
    }

    await createOt(payload, res);
  } catch (error) {
    console.error("Error creating task:", error.message);
    return errorResponse(res, error.message, "Error creating OT detail", 500);
  }
};

exports.updateOtdetail = async (req, res) => {
  try {
    const { id } = req.params;
    const payload = req.body;
    const { error } = updateOTSchema.validate(payload, { abortEarly: false });
    if (error) {
      const errorMessages = error.details.reduce((acc, err) => {
        acc[err.path[0]] = err.message;
        return acc;
      }, {});

      return errorResponse(res, errorMessages, "Validation Error", 403);
    }

    await updateOt(id, payload, res);
  } catch (error) {
    return errorResponse(res, error.message, "Error updating OT detail", 500);
  }
};

exports.deleteOtdetail = async (req, res) => {
  try {
    const { id } = req.params;
    await deleteOt(id, res);
  } catch (error) {
    return errorResponse(res, error.message, "Error deleting OT detail", 500);
  }
};

exports.getOtdetail = async (req, res) => {
  try {
    const { id } = req.params;
    await getOt(id, res);
  } catch (error) {
    return errorResponse(res, error.message, "Error fetching OT detail", 500);
  }
};

exports.getAllOtdetails = async (req, res) => {
  try {
    await getAllOts(req, res);
  } catch (error) {
    return errorResponse(res, error.message, "Error retrieving OT detail", 500);
  }
};
