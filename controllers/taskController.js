const { createTask, updateTask, deleteTask, getTask, getAllTasks,updateTaskData,getTaskList,updateTaskTimeLine } = require('../api/functions/taskFunction');
const { successResponse, errorResponse } = require('../helpers/responseHelper');
const { createTaskSchema, updateTaskSchema,updateTaskDataSchema } = require("../validators/taskValidator");
const Joi = require('joi');

const taskController = {
  createTask: async (req, res) => {
    try {
      const payload = req.body;
      const { error } = createTaskSchema.validate(payload, { abortEarly: false });

      if (error) {
        const errorMessages = error.details.reduce((acc, err) => {
          acc[err.path[0]] = err.message;
          return acc;
        }, {});

        return errorResponse(res, errorMessages, "Validation Error", 403);
      }

      await createTask(payload, res);

    } catch (error) {
      console.error('Error creating task:', error.message);
      return errorResponse(res, error.message, 'Error creating task', 500);
    }
  },

  updateTask: async (req, res) => {
    try {
      const { id } = req.params; 
      const payload = req.body; 
  
      const idValidation = Joi.string().required().validate(id);
      if (idValidation.error) {
        return errorResponse(res, { id: 'Task ID is required and must be valid' }, 'Validation Error', 403);
      }
  
      const { error } = updateTaskSchema.validate(payload, { abortEarly: false });
      if (error) {
        const errorMessages = error.details.reduce((acc, err) => {
          acc[err.path[0]] = err.message;
          return acc;
        }, {});
        return errorResponse(res, errorMessages, "Validation Error", 403);
      }
  
      // Call the updateTask function
      await updateTask(id, payload, res);
  
    } catch (error) {
      return errorResponse(res, error.message, 'Error updating task', 500);
    }
  },
  



  updateDatas:async(req,res)=>{
    try {
      const { id } = req.params;
      const payload = req.body;
      const idValidation = Joi.string().required().validate(id);
      if (idValidation.error) {
        return errorResponse(res, { id: 'Task ID is required and must be valid' }, 'Validation Error', 403);
      }
  
      const { error } = updateTaskDataSchema.validate(payload, { abortEarly: false });
      if (error) {
        const errorMessages = error.details.reduce((acc, err) => {
          acc[err.path[0]] = err.message;
          return acc;
        }, {});

        return errorResponse(res, errorMessages, "Validation Error", 403);
      }

      await updateTaskData(id, payload, res);

    } catch (error) {
      return errorResponse(res, error.message, 'Error updating task', 500);
    }
  },

  deleteTask: async (req, res) => {
    try {
      const { id } = req.params;
      await deleteTask(id, res);

    } catch (error) {
      return errorResponse(res, error.message, 'Error deleting task', 500);
    }
  },

  getTask: async (req, res) => {
    try {
      const { id } = req.params;
      await getTask(id, res);

    } catch (error) {
      return errorResponse(res, error.message, 'Error fetching task', 500);
    }
  },

  getAllTasks: async (req, res) => {
    try {
      await getAllTasks(res);

    } catch (error) {
      return errorResponse(res, error.message, 'Error retrieving tasks', 500);
    }
  },
  


  getTaskDatas: async (req, res) => {
    try {
      const queryParams = req.query;
      await getTaskList(queryParams, res);

    } catch (error) {
      return errorResponse(res, error.message, 'Error fetching task', 500);
    }
  },
  updateTaskTimeLineStatus: async (req, res) => {
    // try {
      await updateTaskTimeLine(req,res);

    // } catch (error) {
    //   return errorResponse(res, error.message, 'Error updating task timeline', 500);
    // }
  },
};



module.exports = taskController;

