const jwt = require("jsonwebtoken");
const BasketModel = require("../models/Basket");
const ProductModel = require("../models/Product");
const sanitizedData = require("../helpers/sanitizedHelpers");

class basketController {
    async getBasket (req, res) {
        try {
            const accessToken = req.cookies.accessToken;

            const token = jwt.verify(accessToken, process.env.SECRET_KEY);

            const basketUser = await BasketModel.findOne({ userId: token.userId });

            const productsId = basketUser.products.map(product => product.productId);

            const productList = await ProductModel.find({ _id: { $in: productsId } });

            const productListWithColor = productList.map(product => {
                const selectedProduct = basketUser.products.find(
                    item => item.productId.equals(product._id)
                );

                if (selectedProduct) {
                    return { ...product.toObject(), selectedColor: selectedProduct.color };
                }

                return product;
            });
            res.setHeader('Cache-Control', 's-max-age=1, stale-while-revalidate');
            return res.json(productListWithColor);
        } catch (e) {
            res.json(e.message);
        }
    }

    async setBasket (req, res) {
        try {
            const {selectedProduct, selectedColor} = req.body;
            const accessToken = req.cookies.accessToken;

            const token = jwt.verify(accessToken, process.env.SECRET_KEY);

            const isValidColor = sanitizedData(selectedColor);
            const isValidProduct = sanitizedData(selectedProduct);

            if (isValidProduct.length === 0 || isValidColor.length === 0) {
                return res.status(403).json({
                    error: {
                        title: "Некоректні дані",
                        data: "На жаль, введені дані заборонені у використанні"
                    }
                })
            }

            const product = await ProductModel.findById(isValidProduct);

            if (!product) {
                return res.json("даного товару не існує")
            }

            const checkProduct = await BasketModel.findOne({
                userId: token.userId,
                'products.productId': isValidProduct,
                'products.color': isValidColor
            });

            if ( checkProduct ) {
                return res.json('цей товар вже доданий до кошика')
            }

            const bas = await BasketModel.findOneAndUpdate(
                { userId: token.userId },
                { $push: { products: {productId: isValidProduct, color: isValidColor} } }
            );
            res.setHeader('Cache-Control', 's-max-age=1, stale-while-revalidate');
            res.json("товар доданий до кошика");
        } catch (e) {
            res.json(e.message)
        }
    }

    async dropBasket (req, res) {
        try {
            const {selectedProduct, selectedColor} = req.body;
            const accessToken = req.cookies.accessToken;

            const token = jwt.verify(accessToken, process.env.SECRET_KEY);

            const isValidColor = sanitizedData(selectedColor);
            const isValidProduct = sanitizedData(selectedProduct);

            if (isValidProduct.length === 0 || isValidColor.length === 0) {
                return res.status(403).json({
                    error: {
                        title: "Некоректні дані",
                        data: "На жаль, введені дані заборонені у використанні"
                    }
                })
            }

            const product = await ProductModel.findById(isValidProduct);

            const basketUser = await BasketModel.findOneAndUpdate(
                { userId: token.userId },
                { $pull: { products: { productId: isValidProduct, color: isValidColor } } }
            );
            res.setHeader('Cache-Control', 's-max-age=1, stale-while-revalidate');
            res.json(product);
        } catch (e) {
            res.json(e.message)
        }
    }
}

module.exports = new basketController();