const Router = require("express");
const router = new Router();
const searchController = require("../controllers/searchController")

router.get('/shortSearch', searchController.shortSearch)

module.exports = router;