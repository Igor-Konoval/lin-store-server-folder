const BrandModel = require("../models/Brand");
const sanitizedData = require("../helpers/sanitizedHelpers");

class BrandController {
    async getBrands(req, res){
        try {
            const allBrand = await BrandModel.find({});
            res.setHeader('Cache-Control', 's-max-age=1, stale-while-revalidate');
            return res.json(allBrand);
        } catch (e) {
            return res.json({message: e});
        }
    }

    async getOneBrand(req, res){
        try {
            let {id} = req.params;

            const isValidId = sanitizedData(id);

            if (isValidId.length === 0) {
                return res.json({message: "Виникла помилка"})
            }

            const brand = await BrandModel.findById(isValidId);

            return res.json(brand);
        } catch (e) {
            return res.json({message: e});
        }
    }

    async createBrand(req, res){
        try {
            let {name} = req.body;

            const isValidName = sanitizedData(name);
            if ( isValidName.length === 0 ) {
                return res.status(403).json({
                    error: {
                        title: "Некоректні дані",
                        data: "На жаль, введені дані заборонені у використанні"
                    }
                })
            }

            const brand = new BrandModel({name: isValidName});
            await brand.save();

            return res.json({message: brand});
        } catch (e) {
            return res.json({message: e});
        }
    }

}

module.exports = new BrandController();