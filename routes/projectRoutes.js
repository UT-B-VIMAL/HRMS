const express = require("express");
const router = express.Router();
const projectController = require("../controllers/project/projectController");
// const checkMethod = require("../helpers/checkMethod");

router.post("/projects", projectController.insert);
router.get("/projects", projectController.getAll);
router.get("/projects/:id", projectController.find);
router.put("/projects/:id", projectController.update);
router.delete("/projects/:id", projectController.delete);

module.exports = router;
