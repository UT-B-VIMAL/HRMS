
const { addComments,updateComments,deleteComments} = require('../api/functions/commentsFunction');
const { successResponse, errorResponse } = require('../helpers/responseHelper');
const Joi = require('joi');

const commentsController = {

// addComments: async (req, res) => {
//     try {
//       const payload = req.body;
//     if (!payload.comments || !payload.comments.trim()) {
//       return errorResponse(res, null, "Comments cannot be empty", 400);
//     }
//       await addComments(payload, res,req);
//     } catch (error) {
//       return errorResponse(res, error.message, 'Error retrieving task comments', 500);
//     }
//   },

addComments: async (req, res) => {
  try {
    const payload = req.body;

    // Require at least a comment or one file
    const hasComment = payload.comments && payload.comments.trim();
    if (!hasComment && files.length === 0) {
      return errorResponse(res, null, "Either a comment or at least one file is required", 400);
    }

    await addComments(payload, res, req);
  } catch (error) {
    return errorResponse(res, error.message, 'Error saving task comment', 500);
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
       if (!payload.comments || !payload.comments.trim()) {
         return errorResponse(res, null, "Comments cannot be empty", 400);
       }
      await updateComments(id,payload, res,req);
    } catch (error) {
      return errorResponse(res, error.message, 'Error updating task comments', 500);
    }
  },

  deleteComments: async (req, res) => {
    try {
        const { id } = req.body;
         const payload = req.body;         
         const idValidation = Joi.string().required().validate(id);
        if (idValidation.error) {
          return errorResponse(res, { id: 'Comments ID is required and must be valid' }, 'Validation Error', 403);
        }
      await deleteComments(id, payload, res,req);
    } catch (error) {
      return errorResponse(res, error.message, 'Error deleting task comments', 500);
    }
  },

};

module.exports = commentsController;