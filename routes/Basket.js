const Router = require('express')
const router = new Router()
const basketController = require('../controllers/basketController');
const authCheck = require('../middleware/authCheck');

router.get('/basketUser', authCheck, basketController.getBasket);
router.post('/basketUser', authCheck, basketController.setBasket);
router.post('/dropBasketUser', authCheck, basketController.dropBasket);

module.exports = router;