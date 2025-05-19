
const { addComments,updateComments,deleteComments} = require('../api/functions/commentsFunction');
const { successResponse, errorResponse } = require('../helpers/responseHelper');
const Joi = require('joi');

const commentsController = {

addComments: async (req, res) => {
    try {
      const payload = req.body;
      await addComments(payload, res);
    } catch (error) {
      return errorResponse(res, error.message, 'Error retrieving task comments', 500);
    }
  },

  updateComments: async (req, res) => {
    try {
        const { id } = req.params; 
        const payload = req.body; 
    
        const idValidation = Joi.string().required().validate(id);
        if (idValidation.error) {
          return errorResponse(res, { id: 'Comments ID is required and must be valid' }, 'Validation Error', 403);
        }
      await updateComments(id,payload, res);
    } catch (error) {
      return errorResponse(res, error.message, 'Error updating task comments', 500);
    }
  },

  deleteComments: async (req, res) => {
    try {
        const { id } = req.body;
         const payload = req.body;
         console.log(payload);
         
        const idValidation = Joi.string().required().validate(id);
        if (idValidation.error) {
          return errorResponse(res, { id: 'Comments ID is required and must be valid' }, 'Validation Error', 403);
        }
      await deleteComments(id, payload, res);
    } catch (error) {
      return errorResponse(res, error.message, 'Error deleting task comments', 500);
    }
  },

};

module.exports = commentsController;