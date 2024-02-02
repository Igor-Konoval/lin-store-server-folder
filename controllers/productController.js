const ProductModel = require("../models/Product")
const CommentModel = require("../models/Comment")
const TypeModel = require("../models/Type");
const BrandModel = require("../models/Brand");
const path = require('path')
const uuid = require("uuid");
const Fuse = require('fuse.js');
const { Storage } = require('@google-cloud/storage');
const sanitizedData = require("../helpers/sanitizedHelpers");

const keyFilename = path.join(__dirname, '..', 'myKey.json');

const storage = new Storage({
    projectId: "",
    keyFilename
});

class ProductController {

    async getOneProduct(req, res) {
        try {
            let {productName} = req.params;

            const isValidProductName = sanitizedData(productName);

            if ( isValidProductName.length === 0 ) {
                return res.json({message: "Виникла помилка"});
            }

            const product = await ProductModel.findOne({name: isValidProductName}).populate('typeId', 'name').populate('brandId', 'name');
            const newProduct = {...product.toObject(), typeId: product.typeId.name, brandId: product.brandId.name};
            return res.json(newProduct);
        } catch (e) {
            return res.status(400).json("такого товару не існує");
        }
    }

    async createProduct(req, res) {
        try {
            let {name, typeId, brandId, price, description, shortDescription, wasInUsed} = req.body;
            const {img} = req.files;

            const isValidName = sanitizedData(name);
            const isValidWasInUsed = sanitizedData(wasInUsed);
            const isValidType = sanitizedData(typeId);
            const isValidBrand = sanitizedData(brandId);
            const isValidPrice = sanitizedData(price);
            const isValidDescription = sanitizedData(JSON.parse(description));
            const isValidShortDesc = sanitizedData(shortDescription);

            if (isValidName.length === 0 ||
                isValidWasInUsed.length === 0 ||
                isValidType.length === 0 ||
                isValidBrand.length === 0 ||
                isValidPrice.length === 0 ||
                isValidDescription.length === 0 ||
                isValidShortDesc.length === 0
            ) {
                return res.status(403).json({
                    error: {
                        title: "Некоректні дані",
                        data: "На жаль, введені дані заборонені у використанні"
                    }
                })
            }

            async function saveImageToGCS(file, folder) {
                const bucketName = '';
                const fileName = `${uuid.v4()}.jpg`;

                const blob = storage.bucket(bucketName).file(fileName);
                const blobStream = blob.createWriteStream();

                return new Promise((resolve, reject) => {
                    blobStream.on('error', (err) => {
                        reject(err)
                            console.log(err)
                        }
                    );

                    blobStream.on('finish', () => {
                        const publicUrl = `https://storage.googleapis.com/${bucketName}/${fileName}`;
                        resolve(publicUrl)
                    });

                    blobStream.end(file.buffer);
                })
            }

            const colors = [];

            for (const key of Object.keys(req.body)) {
                try {
                    if (key.includes("colors")) {
                        if (Array.isArray(req.body.colors)) {
                            for (const colorObj of req.body.colors) {
                                const colorObjValue = JSON.parse(colorObj);

                                const colorIndex = colorObjValue.index;

                                const imageKey = `colors[${colorIndex}][urlImg]`;
                                if (req.files[imageKey]) {
                                    const imgColor = req.files[imageKey][0];

                                    const publicNameFile = await saveImageToGCS(imgColor, 'colors')
                                    colors.push({color: colorObjValue.color, count: colorObjValue.count, urlImg: publicNameFile})
                                }
                            }
                        } else {
                            const colorObj = JSON.parse(req.body.colors);

                            const colorIndex = colorObj.index;

                            const imageKey = `colors[${colorIndex}][urlImg]`;
                            if (req.files[imageKey]) {
                                const imgColor = req.files[imageKey][0];

                                const publicNameFile = await saveImageToGCS(imgColor, 'colors')
                                colors.push({color: colorObj.color, count: colorObj.count, urlImg: publicNameFile})
                            }
                        }
                    }
                } catch (e) {
                    console.log(e)
                    console.error(e)
                }
            }

            const imgGallery = [];
            for (const key of Object.keys(req.files)) {
                if (key.includes("imgGallery")) {
                    const imgItem = (req.files[key]);
                    if (!imgItem) {
                        continue;
                    } else {
                        const publicNameFile = await saveImageToGCS(imgItem[0], 'imgGallery')

                        imgGallery.push(publicNameFile)
                    }
                }
            }

            const publicImgNameFile = await saveImageToGCS(img[0], 'mainImgGallery')
            imgGallery.unshift(publicImgNameFile)

            const comment = new CommentModel({
                comments: []
            })
            await comment.save();

            const product = new ProductModel({
                name: isValidName,
                typeId: isValidType,
                brandId: isValidBrand,
                price: isValidPrice,
                commentId: comment._id,
                description: isValidDescription,
                shortDescription: isValidShortDesc,
                img: imgGallery,
                wasInUsed: isValidWasInUsed,
                totalRating: 0,
                countRating: 0,
                colors
            });

            await product.save();
            await CommentModel.findByIdAndUpdate(comment._id, {
                productId: product._id
            })

            // return res.json({message: product});
            return res.json("ok")
        } catch (e) {
            console.error('Error:', e);
            if (e instanceof Error) {
                console.error('Stack:', e.stack);
            }
            return res.status(500).json({ message: 'Internal Server Error', error: e.message });
        }
    }

    async getAllProduct(req, res) {
        const searchTerm = sanitizedData(req.query.searchTerm);
        const page = sanitizedData(parseInt(req.query.page)) || 1;
        const limit = sanitizedData(parseInt(req.query.limit)) || 10;
        const type = sanitizedData(req.query.type);
        const brand = sanitizedData(req.query.brand);
        const minPrice = sanitizedData(parseInt(req.query.minPrice)) || false;
        const maxPrice = sanitizedData(parseInt(req.query.maxPrice)) || false;
        const sortPrice = sanitizedData(req.query.sortPrice) || false;

        try {
            let productList;
            let totalProducts;
            let fixedMin;
            let fixedMax;

            let findMinPrice = fixedMin = await ProductModel
                .find()
                .sort({price: 1})
                .limit(1)
                .select("price");
            let findMaxPrice = fixedMax = await ProductModel
                .find()
                .sort({price: -1})
                .limit(1)
                .select("price");
            findMinPrice = findMinPrice[0].price;
            findMaxPrice = findMaxPrice[0].price;
            fixedMin = fixedMin[0].price;
            fixedMax = fixedMax[0].price;

            const skip = (page - 1) * limit;

            let typeId = null;
            let brandId = null;

            if (type) {
                const findType = await TypeModel.findOne({name: type});
                if (findType) {
                    typeId = findType._id;
                } else {
                    return res.json({
                        totalProducts: 0,
                        productList: [],
                        currentPage: page,
                        totalPages: 1,
                        // prices: {
                        //     minPrice: minPrice !== false ? minPrice : fixedMin,
                        //     maxPrice: maxPrice !== false ? maxPrice : fixedMax
                        // },
                        // fixedPrices: {
                        //     minPrice: fixedMin,
                        //     maxPrice: fixedMax
                        // }
                        allPrices: {
                            prices: {
                                minPrice: minPrice !== false ? minPrice : fixedMin,
                                maxPrice: maxPrice !== false ? maxPrice : fixedMax
                            },
                            fixedPrices: {
                                minPrice: fixedMin,
                                maxPrice: fixedMax
                            },
                        }
                    })
                }
            }

            if (brand) {
                const findBrand = await BrandModel.findOne({name: brand});
                if (findBrand){
                    brandId = findBrand._id;
                } else {
                    return res.json({
                        totalProducts: 0,
                        productList: [],
                        currentPage: page,
                        totalPages: 1,
                        // prices: {
                        //     minPrice: minPrice !== false ? minPrice : fixedMin,
                        //     maxPrice: maxPrice !== false ? maxPrice : fixedMax
                        // },
                        // fixedPrices: {
                        //     minPrice: fixedMin,
                        //     maxPrice: fixedMax
                        // }
                        allPrices: {
                            prices: {
                                minPrice: minPrice !== false ? minPrice : fixedMin,
                                maxPrice: maxPrice !== false ? maxPrice : fixedMax
                            },
                            fixedPrices: {
                                minPrice: fixedMin,
                                maxPrice: fixedMax
                            },
                        }
                    })
                }
            }

            if (!searchTerm) {
                if (typeId && brandId) {
                    productList = await ProductModel.find({ typeId, brandId });
                } else if (!typeId && brandId) {
                    productList = await ProductModel.find({ brandId });
                } else if (typeId && !brandId) {
                    productList = await ProductModel.find({ typeId });
                } else if (!typeId && !brandId) {
                    productList = await ProductModel.find({});
                }
            } else {
                let products = await ProductModel.find({});

                products = products.map( product => ({...product["_doc"], typeId: product.typeId.toString(), brandId: product.brandId.toString()}))

                const isType = await TypeModel.findOne({name: searchTerm})
                const isBrand = await BrandModel.findOne({name: searchTerm})

                const fuse = new Fuse(products, {
                    keys: ['name', 'description', 'shortDescription', "typeId", "brandId"],
                    includeScore: true,
                    threshold: 0.4,
                });

                if (isType) {
                    productList = fuse
                        .search(isType._id.toString())
                        .map((value) => value.item);
                } else if (isBrand) {
                    productList = fuse
                        .search(isBrand._id.toString())
                        .map((value) => value.item);
                } else {
                    productList = fuse
                        .search(searchTerm)
                        .map((value) => value.item);
                }

                if (typeId && brandId) {
                    productList = productList.filter( product => product.typeId === typeId.toString() && product.brandId === brandId.toString() );
                } else if (!typeId && brandId) {
                    productList = productList.filter( product => product.brandId === brandId.toString() );
                } else if (typeId && !brandId) {
                    productList = productList.filter( product => product.typeId === typeId.toString() );
                }
            }

            if (productList.length === 0) {
                return res.json({
                    totalProducts: 0,
                    productList,
                    currentPage: page,
                    totalPages: 1,
                    prices: {
                        minPrice: minPrice !== false ? minPrice : fixedMin,
                        maxPrice: maxPrice !== false ? maxPrice : fixedMax
                    },
                    // fixedPrices: {
                    //     minPrice: fixedMin,
                    //     maxPrice: fixedMax
                    // }
                    allPrices: {
                        prices: {
                            minPrice: minPrice !== false ? minPrice : fixedMin,
                            maxPrice: maxPrice !== false ? maxPrice : fixedMax
                        },
                        fixedPrices: {
                            minPrice: fixedMin,
                            maxPrice: fixedMax
                        },
                    }
                })
            }

            findMinPrice = fixedMin = productList.sort((a, b) => a.price - b.price)
            findMaxPrice = fixedMax = productList.sort((a, b) => a.price + b.price)

            findMinPrice = findMinPrice[0].price;
            findMaxPrice = findMaxPrice[findMaxPrice.length - 1].price;

            fixedMin = findMinPrice;
            fixedMax = findMaxPrice;

            if (minPrice && !maxPrice) {
                productList = productList.filter(product => product.price >= minPrice);
                findMinPrice = minPrice;
            } else if (!minPrice && maxPrice) {
                productList = productList.filter(product => product.price <= maxPrice);
                findMaxPrice = maxPrice;
            } else if (minPrice && maxPrice) {
                productList = productList.filter(product => product.price >= minPrice && product.price <= maxPrice);
                findMinPrice = minPrice;
                findMaxPrice = maxPrice;
            }

            if (sortPrice !== false) {
                if (sortPrice === "від низької") {
                    productList.sort((a, b) => +a.price - +b.price)
                }
                if (sortPrice === "від високої") {
                    productList.sort((a, b) => +a.price > +b.price ? -1 : 1)
                }
                if (sortPrice === "за купленими") {
                    productList.sort((a, b) => +a.countSales > +b.countSales ? -1 : 1)
                }
                if (sortPrice === "за відгуками") {
                    productList.sort((a, b) => +a.totalRating > +b.totalRating ? -1 : 1)
                }
            }

            totalProducts = productList.length;

            productList = productList.slice(skip, skip + limit);

            const totalPages = Math.ceil(totalProducts / limit);

            if ((!searchTerm || searchTerm.length === 0) && !type && !brand && !minPrice && !maxPrice) {

                return res.json({
                    totalProducts: null,
                    productList,
                    currentPage: page,
                    totalPages,
                    // prices: {
                    //     minPrice: findMinPrice,
                    //     maxPrice: findMaxPrice
                    // },
                    // fixedPrices: {
                    //     minPrice: fixedMin,
                    //     maxPrice: fixedMax
                    // },
                    allPrices: {
                        prices: {
                            minPrice: findMinPrice,
                            maxPrice: findMaxPrice
                        },
                        fixedPrices: {
                            minPrice: fixedMin,
                            maxPrice: fixedMax
                        },
                    }
                })
            }

            return res.json({
                totalProducts,
                productList,
                currentPage: page,
                totalPages,
                // prices: {
                //     minPrice: findMinPrice,
                //     maxPrice: findMaxPrice
                // },
                // fixedPrices: {
                //     minPrice: fixedMin,
                //     maxPrice: fixedMax
                // }
                allPrices: {
                    prices: {
                        minPrice: findMinPrice,
                        maxPrice: findMaxPrice
                    },
                    fixedPrices: {
                        minPrice: fixedMin,
                        maxPrice: fixedMax
                    },
                }
            });
        } catch (e) {
            console.log(e)
            return res.json({ message: e });
        }
    }
}

module.exports = new ProductController();