const { createSubTask, updateSubTask, deleteSubTask, getSubTask,getAllSubTasks,updatesubTaskData,bulkimportSubTask } = require('../api/functions/subtaskFunction');
const { successResponse, errorResponse } = require('../helpers/responseHelper');
const Joi = require('joi');
const { createSubTaskSchema ,updateSubTaskSchema } = require("../validators/subtaskValidator");


exports.createSubTask = async (req, res) => {
    try {
        const payload = req.body;
        const { error } = createSubTaskSchema.validate(payload, { abortEarly: false });

        if (error) {
            const errorMessages = error.details.reduce((acc, err) => {
                acc[err.path[0]] = err.message;
                return acc;
            }, {});

            return errorResponse(res, errorMessages, "Validation Error", 403);
        }

        await createSubTask(payload, res,req);

    } catch (error) {
        console.error('Error creating task:', error.message);
        return errorResponse(res, error.message, 'Error creating task', 500);
    }
};

exports.bulkimportSubTask = async (req, res) => {
    try {
      const payload = req.body;
      
      await bulkimportSubTask(payload, res,req);

    } catch (error) {
      console.error('Error importing task:', error.message);
      return errorResponse(res, error.message, 'Error importing task', 500);
    }
}

exports.updateSubTask = async (req, res) => {
    try {
        const { id } = req.params;
        const payload = req.body;
        const { error } = updateSubTaskSchema.validate(payload, { abortEarly: false });
        if (error) {
            const errorMessages = error.details.reduce((acc, err) => {
                acc[err.path[0]] = err.message;
                return acc;
            }, {});

            return errorResponse(res, errorMessages, "Validation Error", 403);
        }

        await updateSubTask(id, payload, res);
    } catch (error) {
        return errorResponse(res, error.message, 'Error updating task', 500);
    }
};

exports.deleteSubTask = async (req, res) => {
    try {
        // const { id } = req.params;
        await deleteSubTask(req, res);
    } catch (error) {
        return errorResponse(res, error.message, 'Error deleting task', 500);
    }
};

exports.getSubTask = async (req, res) => {
    try {
        const { id } = req.params;
        await getSubTask(id, res);
    } catch (error) {
        return errorResponse(res, error.message, 'Error fetching task', 500);
    }
};

exports.getAllSubTasks = async (req, res) => {
    try {
        await getAllSubTasks(req,res);
    } catch (error) {
        return errorResponse(res, error.message, 'Error retrieving tasks', 500);
    }
};

exports.updateDatas=async(req,res)=>{
    try {
      const { id } = req.params;
      const payload = req.body;
      const idValidation = Joi.string().required().validate(id);
      if (idValidation.error) {
        return errorResponse(res, { id: 'SubTask ID is required and must be valid' }, 'Validation Error', 403);
      }
      const { error } = updateSubTaskSchema .validate(payload, { abortEarly: false });

      if (error) {
        const errorMessages = error.details.reduce((acc, err) => {
          acc[err.path[0]] = err.message;
          return acc;
        }, {});

        return errorResponse(res, errorMessages, "Validation Error", 403);
      }

      await updatesubTaskData(id, payload, res,req);

    } catch (error) {
      return errorResponse(res, error.message, 'Error updating task', 500);
    }
  };
