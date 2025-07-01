
const { addComments,updateComments,deleteComments} = require('../api/functions/commentsFunction');
const { successResponse, errorResponse } = require('../helpers/responseHelper');
const Joi = require('joi');

const commentsController = {

addComments: async (req, res) => {
  try {
    const payload = req.body;

    // Check for at least comment or one file
    const hasComment = payload.comments && payload.comments.trim();
    const hasFiles =
      req.files &&
      (
        Array.isArray(req.files.files)
          ? req.files.files.length > 0
          : req.files.files !== undefined
      );

    if (!hasComment && !hasFiles) {
      return errorResponse(
        res,
        null,
        "Either a comment or at least one file is required",
        400
      );
    }

    await addComments(payload, res, req);
  } catch (error) {
    return errorResponse(res, error.message, "Error saving task comment", 500);
  }
},


 getComments : async (req, res) => {
  try {
    const { id } = req.params;

    const idValidation = Joi.string().required().validate(id);
    if (idValidation.error) {
      return errorResponse(
        res,
        { id: "Comments ID is required and must be valid" },
        "Validation Error",
        403
      );
    }

    await getCommentById(id, res); 
    } catch (error) {
      return errorResponse(res, error.message, 'Error updating task comments', 500);
    }
  },


updateComments: async (req, res) => {
  try {
    const { id } = req.params;
    const payload = req.body;

    // Validate comment ID
    const idValidation = Joi.string().required().validate(id);
    if (idValidation.error) {
      return errorResponse(
        res,
        { id: "Comments ID is required and must be valid" },
        "Validation Error",
        403
      );
    }

    // Check if at least a comment or file is present
    const hasComment = payload.comments && payload.comments.trim();
    const hasFiles =
      req.files &&
      (
        Array.isArray(req.files.files)
          ? req.files.files.length > 0
          : req.files.files !== undefined
      );

    if (!hasComment && !hasFiles) {
      return errorResponse(
        res,
        null,
        "Either a comment or at least one file is required",
        400
      );
    }

    // Proceed to actual update function
    await updateComments(id, payload, res, req);
  } catch (error) {
    return errorResponse(
      res,
      error.message,
      "Error updating task comments",
      500
    );
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