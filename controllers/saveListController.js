const SaveListModel = require("../models/SaveModel")
const ProductModel = require("../models/Product")
const jwt = require("jsonwebtoken");
const {ObjectId} = require("mongodb");
const sanitizedData = require("../helpers/sanitizedHelpers");

class SaveListController {
    async getSaveList (req, res) {
        try {
            const accessToken = req.cookies.accessToken;
            const token = jwt.verify(accessToken, process.env.SECRET_KEY);

            const userSaveList = await SaveListModel.findOne({userId: token.userId});

            const products = await ProductModel.find({_id: { $in: userSaveList.productsId}})

            return res.json(products);
        } catch (e) {
            res.json({message: e.message});
        }
    }
    async setSaveList (req, res) {
        try {
            const {productId} = req.body;

            const isValidProductId = sanitizedData(productId);

            if ( isValidProductId.length === 0 ) {
                return res.json({ message: "Виникла помилка" });
            }

            const accessToken = req.cookies.accessToken;
            const token = jwt.verify(accessToken, process.env.SECRET_KEY);

            const isExistProduct = await ProductModel.findById(isValidProductId);
            if (!isExistProduct) return res.json({message: "даного товару не існує"});

            const userSaveList = await SaveListModel.findOne({userId: token.userId});
            if (!userSaveList) return res.status(500).json({message: "щось пішло не так..."})

            const isExistSave = await SaveListModel.findOne({userId: token.userId, productsId: {
                $elemMatch: { $eq: new ObjectId(isValidProductId) }
            }})

            if (isExistSave) {
                await SaveListModel.findOneAndUpdate(
                    { userId: token.userId },
                    { $pull: { productsId: { $eq: new ObjectId(isValidProductId) } } }
                );

                return res.json(false)
            }

            await SaveListModel.findOneAndUpdate(
                { userId: token.userId },
                { $push: { productsId: new ObjectId(isValidProductId) } }
            );

            res.json(true)
        } catch (e) {
            res.json({message: e.message})
        }
    }

    async checkProduct (req, res) {
        try {
            const isValidId = sanitizedData(req.params.id);

            const accessToken = req.cookies.accessToken;
            const token = jwt.verify(accessToken, process.env.SECRET_KEY);

            const isExistProduct = await ProductModel.findById(isValidId);
            if (!isExistProduct) return res.json({message: "даного товару не існує"});

            const isExistSave = await SaveListModel.findOne({userId: token.userId, productsId: {
                $elemMatch: { $eq: new ObjectId(isValidId)}
            }})

            res.json(Boolean(isExistSave))
        } catch (e) {
            res.json({message: e.message})
        }
    }

    async removeSaveList (req, res) {
        try {
            const isValidId = sanitizedData(req.params.id);

            const accessToken = req.cookies.accessToken;
            const token = jwt.verify(accessToken, process.env.SECRET_KEY);

            await SaveListModel.findOneAndUpdate({userId: token.userId},
                {
                    $pull: { productsId: isValidId }
                })

            res.json("ok")
        } catch (e) {
            res.json({message: e.message})
        }
    }
}

module.exports = new SaveListController()