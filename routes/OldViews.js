const Router = require('express');
const router = new Router();
const OldViewsController = require("../controllers/OldViewsController");
const authCheck = require("../middleware/authCheck");

router.get("/", authCheck, OldViewsController.getOldViews)
router.put("/", authCheck, OldViewsController.updateOldViews)
router.post("/", authCheck, OldViewsController.addProduct)

module.exports = router