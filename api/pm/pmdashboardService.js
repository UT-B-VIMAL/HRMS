// services/userService.js
const db = require("../../config/db"); // Your database connection
const {
  successResponse,
  errorResponse,
} = require("../../helpers/responseHelper");

// Insert user logic
exports.fetchProducts = async (payload, res) => {
  try {
    // Step 1: Get products
    const productsQuery = "SELECT * FROM products";
    const [products] = await db.promise().query(productsQuery);

    const result = await Promise.all(
      products.map(async (product) => {
        const tasksQuery = "SELECT * FROM tasks WHERE product_id = ?";
        const [tasks] = await db.promise().query(tasksQuery, [product.id]);

        let totalItems = 0;
        let completedItems = 0;
        let workingEmployees = new Set(); // Using Set to avoid duplicate employees
        for (const task of tasks) {
          const subtasksQuery = "SELECT * FROM sub_tasks WHERE task_id = ?";
          const [subtasks] = await db.promise().query(subtasksQuery, [task.id]);

          if (subtasks.length > 0) {
            totalItems += subtasks.length;
            completedItems += subtasks.filter(
              (subtask) => subtask.status === 3
            ).length;

            subtasks.forEach((subtask) => {
              if (subtask.user_id) workingEmployees.add(subtask.user_id); 
            });
          } else {
            totalItems += 1;
            if (task.status === 3) completedItems += 1;

            if (task.user_id) workingEmployees.add(task.user_id); 
          }
        }

        const completionPercentage =
          totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

        let employeeList = [];
        if (workingEmployees.size > 0) {
          const employeeDetailsQuery = "SELECT * FROM users WHERE id IN (?)";
          const [employees] = await db
            .promise()
            .query(employeeDetailsQuery, [Array.from(workingEmployees)]);

          employeeList = employees.map((user) => {
            const words = user.name
              ? user.name.split(" ").filter((word) => word)
              : [];

            // Generate initials
            let initials = "NA";
            if (words.length > 1) {
              initials = words.map((word) => word[0].toUpperCase()).join("");
            } else if (words.length === 1) {
              initials = words[0].slice(0, 2).toUpperCase();
            }

            return {
              employee_name: user.name || "N/A",
              employee_id: user.employee_id || "N/A",
              initials: initials,
            };
          });
        }

        // Return formatted product data
        return {
          product_id: product.id,
          product_name: product.name,
          completed_percentage: completionPercentage,
          employee_count: workingEmployees.size,
          employees: employeeList,
        };
      })
    );

    // Final result
    const productsList = {
      total_products: products.length,
      product_data: result,
    };

    return successResponse(
      res,
      productsList,
      "Products retrieved successfully",
      200
    );
  } catch (error) {
    console.error("Error fetching products:", error);
    return errorResponse(res, error.message, "Error fetching products", 500);
  }
};
