const Router = require('express')
const router = new Router()
const brandController = require('../controllers/brandController')
const checkRole = require("../middleware/checkRole")

router.get('/', brandController.getBrands);
router.get('/:id', brandController.getOneBrand);
router.post('/', checkRole('Admin'), brandController.createBrand);

module.exports = router;
