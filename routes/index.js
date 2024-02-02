const Router = require('express')
const router = new Router()
const userRouter = require('./Users')
const brandRouter = require('./Brands')
const typeRouter = require('./Type')
const productRouter = require('./Product')
const basketRouter = require('./Basket')
const orderRouter = require('./Order');
const commentRouter = require('./Comment');
const saveListRouter = require('./SaveList');
const oldViewsRouter = require('./OldViews')
const searchRouter = require('./Search')

router.use('/user', userRouter)
router.use('/brand', brandRouter)
router.use('/type', typeRouter)
router.use('/basket', basketRouter)
router.use('/product', productRouter)
router.use('/order', orderRouter)
router.use('/comment', commentRouter)
router.use('/saveList', saveListRouter)
router.use('/oldViews', oldViewsRouter)
router.use('/search', searchRouter)

module.exports = router;
