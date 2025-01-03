const {
    createexpense
  } = require("../api/functions/expenseFunction");
  const { successResponse, errorResponse } = require("../helpers/responseHelper");
  const Joi = require("joi");
  const { createExpenseSchema } = require("../validators/expenseValidator");
  
  exports.createexpensedetail = async (req, res) => {
    try {
      const payload = req.body;
      const { error } = createExpenseSchema.validate(payload, { abortEarly: false });
  
      if (error) {
        const errorMessages = error.details.reduce((acc, err) => {
          acc[err.path[0]] = err.message;
          return acc;
        }, {});
  
        return errorResponse(res, errorMessages, "Validation Error", 403);
      }
  
      await createexpense(req, res);
    } catch (error) {
      console.error("Error creating OT:", error.message);
      return errorResponse(res, error.message, "Error creating OT detail", 500);
    }
  };
  exports.approve_reject_otdetail = async (req, res) => {
    try {
      const payload = req.body;
  
      await approve_reject_OT(payload, res);
    } catch (error) {
      console.error("Error upadating status:", error.message);
      return errorResponse(res, error.message, "Error upadating status", 500);
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
  exports.updatetlOtdetail = async (req, res) => {
    try {
      const { id } = req.params;
      const payload = req.body;
      const { error } = updatetlOTSchema.validate(payload, { abortEarly: false });
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
  exports.getAllpmemployeeOtdetails = async (req, res) => {
    try {
      await getAllpmemployeeOts(req, res);
    } catch (error) {
      return errorResponse(res, error.message, "Error retrieving OT detail", 500);
    }
  };
  exports.getAlltlemployeeOtdetails = async (req, res) => {
    try {
      await getAlltlemployeeOts(req, res);
    } catch (error) {
      return errorResponse(res, error.message, "Error retrieving OT detail", 500);
    }
  };
  