const Router = require('express')
const router = new Router()
const OrderController = require('../controllers/orderController');
const authCheck = require('../middleware/authCheck');

router.get('/orderUser', authCheck, OrderController.getOrder);

router.get('/checkOrderForCom/:productId', authCheck, OrderController.checkOrderForCom);
router.post('/identifyCity', OrderController.identifyCity);
router.post('/identifyDepartment', OrderController.identifyDepartment);
router.post('/checkDetails', OrderController.checkDetails);
router.post('/getStreet', OrderController.getStreet);
router.put('/cancelOrder', OrderController.cancelOrder);
router.post('/createDocument', authCheck, OrderController.createDocument);
router.get('/acceptOrder/:orderNumber', authCheck, OrderController.acceptOrder);
router.get('/rejectOrder/:orderNumber', authCheck, OrderController.rejectOrder);

module.exports = router;