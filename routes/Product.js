const Router = require('express')
const router = new Router()
const Product = require("../controllers/productController")
const checkRole = require("../middleware/checkRole");
const Multer = require("multer");

const multer = Multer({
    storage: Multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
})

router.get('/', Product.getAllProduct);
router.get('/:productName', Product.getOneProduct);
router.post('/', checkRole('Admin'),
    multer.fields([
    { name: 'img', maxCount: 1 },
    { name: 'imgGallery[0]', maxCount: 1 },
    { name: 'imgGallery[1]', maxCount: 1 },
    { name: 'imgGallery[2]', maxCount: 1 },
    { name: 'imgGallery[3]', maxCount: 1 },
    { name: 'imgGallery[4]', maxCount: 1 },
    { name: 'imgGallery[5]', maxCount: 1 },
    { name: 'imgGallery[6]', maxCount: 1 },
    { name: 'imgGallery[7]', maxCount: 1 },
    { name: 'imgGallery[8]', maxCount: 1 },
    { name: 'imgGallery[9]', maxCount: 1 },

    { name: 'colors[0][urlImg]', maxCount: 1 },
    { name: 'colors[1][urlImg]', maxCount: 1 },
    { name: 'colors[2][urlImg]', maxCount: 1 },
    { name: 'colors[3][urlImg]', maxCount: 1 },
    { name: 'colors[4][urlImg]', maxCount: 1 },
    { name: 'colors[5][urlImg]', maxCount: 1 },
    { name: 'colors[6][urlImg]', maxCount: 1 },
    { name: 'colors[7][urlImg]', maxCount: 1 },
    { name: 'colors[8][urlImg]', maxCount: 1 },
    { name: 'colors[9][urlImg]', maxCount: 1 },
    { name: 'colors[10][urlImg]', maxCount: 1 },
    { name: 'colors[11][urlImg]', maxCount: 1 },
]),
    Product.createProduct);

module.exports = router;
