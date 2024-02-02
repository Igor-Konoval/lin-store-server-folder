const TypeModel = require('../models/Type')
const sanitizedData = require("../helpers/sanitizedHelpers");
class TypeController {
    async getAllTypes(req, res){
        try {
            const allTypes = await TypeModel.find({});
            res.setHeader('Cache-Control', 's-max-age=1, stale-while-revalidate');
            return res.json(allTypes);
        } catch (e) {
            return res.json({message: e});
        }
    }

    async getOneType(req, res){
        try {
            const isValidId = sanitizedData(req.params.id)

            const type = await TypeModel.findById(isValidId);

            return res.json(type);
        } catch (e) {
            return res.json({message: e});
        }
    }

    async createType(req, res){
        try {
            let {name} = req.body;

            const isValidName = sanitizedData(name)

            const type = new TypeModel({name: isValidName});
            await type.save();
            return res.json({message: type});
        } catch (e) {

        }
    }

}

module.exports = new TypeController();