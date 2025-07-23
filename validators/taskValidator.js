const Joi = require('joi');

const validationshems = {
  createTaskSchema: Joi.object({
    product_id: Joi.number().integer().required().messages({
      'number.base': 'Product ID must be a number',
      'number.integer': 'Product ID must be an integer',
      'any.required': 'Product ID is required',
    }),
    project_id: Joi.number().integer().required().messages({
      'number.base': 'Project ID must be a number',
      'number.integer': 'Project ID must be an integer',
      'any.required': 'Project ID is required',
    }),
    user_id: Joi.number().integer().required().messages({
      'number.base': 'User ID must be a number',
      'number.integer': 'User ID must be an integer',
      'any.required': 'User ID is required',
    }),
    name: Joi.string().required().messages({
      'string.empty': 'Task name is required',
      'any.required': 'Task name is required',
    }),
    // estimated_hours: Joi.string().pattern(/^([0-9]{2}):([0-9]{2}):([0-9]{2})$/).required().messages({
    //   'string.pattern.base': 'Estimated hours must be in the format HH:MM:SS (e.g., 00:00:00)',
    //   'any.required': 'Estimated hours is required',
    // }),
    // start_date: Joi.date().required().messages({
    //   'date.base': 'Start date must be a valid date',
    //   'any.required': 'Start date is required',
    // }),
    // end_date: Joi.date().min(Joi.ref('start_date')).optional().messages({
    //   'date.base': 'End date must be a valid date',
    //   'date.min': 'End date must be greater than or equal to the start date',
    // }),
    
  }).unknown(true),

  updateTaskSchema: Joi.object({
 
    estimated_hours: Joi.string()
    .pattern(/^((\d+)d\s*)?((\d+)h\s*)?((\d+)m\s*)?$/)
    .required()
    .messages({
      'string.pattern.base': 'Estimated hours must be in the format "1d 2h 45m" or "2h 30m"',
      'any.required': 'Estimated hours is required',
    }),  
    start_date: Joi.date().optional().messages({
      'date.base': 'Start date must be a valid date',
    }),
    end_date: Joi.date().min(Joi.ref('start_date')).optional().messages({
      'date.base': 'End date must be a valid date',
      'date.min': 'End date must be greater than or equal to the start date',
    }),
    
  }).unknown(true),

  updateTaskDataSchema: Joi.object({

  }).unknown(true),
  updateTimelineShema : Joi.object({
    id: Joi.number().required().messages({
      'any.required': 'Subtask ID is required.',
      'number.base': 'Subtask ID must be a valid number.'
  }),
  status: Joi.number().optional(),
  action: Joi.string().required().valid('start', 'pause', 'end').messages({
      'any.required': 'Action is required.',
      'any.only': 'Action must be one of start, pause, or end.'
  }),
  type: Joi.string().required().valid('subtask', 'task').messages({
      'any.required': 'Type is required.',
      'any.only': 'Type must be either subtask or task.'
  }),
  active_status: Joi.number().optional(),
  last_start_time: Joi.date().when('action', {
    is: Joi.valid('pause', 'end'),
      then: Joi.required().messages({
          'any.required': 'Last start time is required for ending a subtask.',
      }),
  }),
  timeline_id: Joi.number().when('action', {
    is: Joi.valid('pause', 'end'),
      then: Joi.required().messages({
          'any.required': 'Timeline ID is required for ending a subtask.'
      }),
  })
})
};


module.exports = validationshems;
