const {
    createexpense,
    updateexpenses,
    getexpense,
    deleteExpense,
    getAllexpense
  } = require("../api/functions/expenseFunction");
  const { errorResponse } = require("../helpers/responseHelper");
  const Joi = require("joi");
  const { createExpenseSchema, updateExpenseSchema } = require("../validators/expenseValidator");
  
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
      console.error("Error creating Expense:", error.message);
      return errorResponse(res, error.message, "Error creating Expense detail", 500);
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
  
  exports.updateexpensedetail = async (req, res) => {
    try {
      const { id } = req.params;
      const payload = req.body;
      const { error } = updateExpenseSchema.validate(payload, { abortEarly: false });
      if (error) {
        const errorMessages = error.details.reduce((acc, err) => {
          acc[err.path[0]] = err.message;
          return acc;
        }, {});
  
        return errorResponse(res, errorMessages, "Validation Error", 403);
      }
  
      await updateexpenses(id, req, res);
    } catch (error) {
      return errorResponse(res, error.message, "Error updating expense detail", 500);
    }
  };
  
  exports.deleteexpensedetail = async (req, res) => {
    try {
      const { id } = req.params;
      await deleteExpense(id, res);
    } catch (error) {
      return errorResponse(res, error.message, "Error deleting OT detail", 500);
    }
  };
  
  exports.getexpensedetail = async (req, res) => {
    try {
      const { id } = req.params;
      await getexpense(id, res);
    } catch (error) {
      return errorResponse(res, error.message, "Error fetching expense detail", 500);
    }
  };
  
  exports.getAllexpensedetails = async (req, res) => {
    try {
      await getAllexpense(req, res);
    } catch (error) {
      return errorResponse(res, error.message, "Error retrieving Expense detail", 500);
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
  