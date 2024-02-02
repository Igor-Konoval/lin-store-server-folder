const ProductModel = require("../models/Product");
const BrandModel = require("../models/Brand");
const TypeModel = require("../models/Type");
const Fuse = require("fuse.js");
const sanitizedData = require("../helpers/sanitizedHelpers");

class SearchController {
    async shortSearch (req, res) {
        try {
            const isValidSearchTerm = sanitizedData(req.query.q)

            const products = await ProductModel.find({}, 'name shortDescription img price totalRating countRating');
            const brands = await BrandModel.find();
            const types = await TypeModel.find();

            const fuseProducts = new Fuse(products, {
                keys: ['name', 'shortDescription'],
                includeScore: true,
                threshold: 0.2,
            });

            const productList = fuseProducts
                .search(isValidSearchTerm)
                .map((value) => value.item).slice(0, 3);

            const fuseBrands = new Fuse(brands, {
                keys: ['name'],
                includeScore: true,
                threshold: 0.4,
            });

            const brandList = fuseBrands
                .search(isValidSearchTerm)
                .map((value) => {
                    return { ...value.item["_doc"], info: "brand" };
                });

            const fuseTypes = new Fuse(types, {
                keys: ['name'],
                includeScore: true,
                threshold: 0.4,
            });

            const typeList = fuseTypes
                .search(isValidSearchTerm)
                .map((value) => {
                    return { ...value.item["_doc"], info: "type" };
                });

            const result = [...productList, ...brandList, ...typeList]

            return res.json(result)
        } catch (e) {
            res.json({message: e.message})
        }
    }
}

module.exports = new SearchController();