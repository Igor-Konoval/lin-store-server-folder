const ProductModel = require("../models/Product");
const OldViewsModel = require("../models/OldViews");
const jwt = require("jsonwebtoken");
const {ObjectId} = require("mongodb");
const sanitizedData = require("../helpers/sanitizedHelpers");

class OldViewsController {
    async getOldViews (req, res) {
        try {
            const accessToken = req.cookies.accessToken;
            const token = jwt.verify(accessToken, process.env.SECRET_KEY);

            const oldViews = await OldViewsModel.findOne({ userId: token.userId });

            const products = await ProductModel.find({ _id: { $in: oldViews.productsId } });

            const sortedProducts = oldViews.productsId
                .reverse()
                .map(id => products
                    .find(product => product._id
                        .equals(id)
                    )
                );

            res.json(sortedProducts);
        } catch (e) {
            res.json({ message: e.message });
        }
    }


    async addProduct(req, res) {
        try {
            const { productId } = req.body;
            const accessToken = req.cookies.accessToken;
            const token = jwt.verify(accessToken, process.env.SECRET_KEY);

            const isValidProductId = sanitizedData(productId);

            if (isValidProductId.length === 0) {
                return res.json({ message: "Виникла помилка" });
            }

            const product = await ProductModel.findById(isValidProductId);
            if (!product) {
                return res.json({ message: "Даного товару не існує" });
            }

            const oldViewsResult = await OldViewsModel.findOne({ userId: token.userId });

            if (oldViewsResult) {
                if (oldViewsResult.productsId.length >= 24) {
                    oldViewsResult.productsId.shift();
                }

                oldViewsResult.productsId.push(new ObjectId(isValidProductId));

                await oldViewsResult.save();
                res.json("ok");
            } else {
                res.status(500).json({ message: "Помилка сервера..." });
            }
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    }

    async updateOldViews(req, res) {
        try {
            const { productId } = req.body;
            const accessToken = req.cookies.accessToken;
            const token = jwt.verify(accessToken, process.env.SECRET_KEY);

            const isValidProductId = sanitizedData(productId);

            if (isValidProductId.length === 0) {
                return res.json({ message: "Виникла помилка" });
            }

            const product = await ProductModel.findById(isValidProductId);
            if (!product) {
                return res.json({ message: "Даного товару не існує" });
            }

            const updateOldViews = await OldViewsModel.findOne({ userId: token.userId });
            if (!updateOldViews) {
                return res.json({ message: "Даних про переглянуті товари не знайдено" });
            }

            updateOldViews.productsId = updateOldViews.productsId.filter(id => !id.equals(new ObjectId(isValidProductId)));
            updateOldViews.productsId.push(new ObjectId(isValidProductId));

            await updateOldViews.save();

            res.json("ok");
        } catch (e) {
            res.json({ message: e.message });
        }
    }
}

module.exports = new OldViewsController();