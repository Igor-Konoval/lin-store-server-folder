const CommentModel = require("../models/Comment");
const UserModel = require("../models/User")
const {ResponseCommentUser ,CommentUserModel} = require("../models/CommentUser");
const ProductModel = require("../models/Product");
const OrderModel = require("../models/Order");
const GoogleUserModel = require("../models/GoogleUser");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const sanitizedData = require("../helpers/sanitizedHelpers");

class CommentController {
    async createComment (req, res) {
        try {
            const {productId, rating, commentData, commentDate} = req.body;

            const accessToken = req.cookies.accessToken;
            const token = jwt.verify(accessToken, process.env.SECRET_KEY);

            const isValidData = sanitizedData(commentData);
            const isValidDate = sanitizedData(commentDate);
            const isValidRating = sanitizedData(rating);
            const isValidProductId = sanitizedData(productId);

            if (isValidData.length === 0 || isValidDate.length === 0 || isValidRating.length === 0 || isValidProductId.length === 0) {
                return res.status(403).json({
                    error: {
                        title: "Некоректні дані",
                        data: "На жаль, введені дані заборонені у використанні"
                    }
                })
            }

            const isExistComment = await CommentUserModel.find({
                productId: isValidProductId,
                userId: token.userId
            })

            const checkOrder = await OrderModel.findOne({
                userId: token.userId,
                products: {
                    $elemMatch: {
                        _id: isValidProductId
                    }
                }
            });

            if (!checkOrder && rating > 0) {
                return res.status(403).json({
                    error: {
                        title: "Вам потрібно придбати товар.",
                        data: "На жаль, оцінка товару доступна тільки після його покупки."
                    }
                })
            }

            const checkRating = isExistComment.filter( comment => comment.rating > 0)
            if ( checkRating.length >= 1 && rating > 0) {
                return res.status(403).json({
                    error: {
                        title:"ви не можете ще раз оцінити товар.",
                        data:"На жаль, оцінка товару доступна лише один раз."
                    }
                })
            }

            const isGetProduct = checkOrder?.status === 9 || checkOrder?.status === 10 || checkOrder?.status === 11;

            if ( isExistComment.length >= 3 && !isGetProduct) {
                return res.status(403).json({
                    error: {
                        title:"Обмеження за кількістю коментарів.",
                        data:"На жаль, ви не можете зробити більше коментарів, купіть товар для створення відгуку."
                    }
                })
            }

            if ( isExistComment.length >= 3 && isGetProduct && rating == 0) {
                return res.status(403).json({
                    error: {
                        title:"Обмеження за кількістю відгуків та коментарів.",
                        data:"На жаль, кількість відгуків перевищила допустиму кількість."
                    }
                })
            }

            let commentUserData

            if (isGetProduct) {
                commentUserData = {
                    productId: isValidProductId,
                    username: token.username,
                    rating: isValidRating,
                    userId: token.userId,
                    commentData: isValidData,
                    commentDate: isValidDate,
                    isGetOrder: true
                };
            } else {
                commentUserData = {
                    productId: isValidProductId,
                    username: token.username,
                    rating: 0,
                    userId: token.userId,
                    commentData: isValidData,
                    commentDate: isValidDate,
                };
            }

            const commentUser = new CommentUserModel(commentUserData)

            await commentUser.save();

            const userResult = await UserModel.findByIdAndUpdate(token.userId, { $push: {
                commentsId: commentUser._id
            }})

            if (!userResult) {
                await GoogleUserModel.findByIdAndUpdate(token.userId, { $push: {
                    commentsId: commentUser._id
                }})
            }

            const pushComment = await CommentModel.findOneAndUpdate({productId: isValidProductId}, {
                $push: {
                    comments: commentUser
                }
            },
                {new: true}
            );

            const countRating = pushComment.comments.filter( comment => comment.rating > 0 ).map( comment => comment.rating);
            const totalRating = +(countRating.reduce(( prev, current ) => prev + current, 0) / countRating.length).toFixed(1);

            if (!countRating.length) {
                return res.json("ok");
            }

            await ProductModel.findOneAndUpdate({_id: isValidProductId}, {
                $set: {
                    countRating: countRating.length,
                    totalRating
                }
            })

            res.json("ok");
        } catch (e) {
            console.log(e.message)
            res.json({message: e.message})
        }
    }

    async getAllComments (req, res) {
        try {
            let {id} = req.params;

            const isValidId = sanitizedData(id);

            if (isValidId.length === 0) {
                return res.json({message: "Виникла помилка"})
            }

            const commentsProduct = await CommentModel.findOne({productId: isValidId})

            res.json(commentsProduct.comments)
        } catch (e) {
            console.log(e.message)
            res.json({message: e.message})
        }
    }

    async commentsUser (req, res) {
        try {
            const accessToken = req.cookies.accessToken;
            const token = jwt.verify(accessToken, process.env.SECRET_KEY);

            const userComments = await CommentUserModel.find({userId: token.userId})
            const userResponseComments = await ResponseCommentUser.find({userId: token.userId})

            const productsId = userComments.map( comment => comment.productId );
            const productsResId = userResponseComments.map( comment => comment.productId );

            const products = await ProductModel.find({_id: { $in: new Array().concat(productsId, productsResId)}})

            const transformComments = products.map( product => {
                const findComments = userComments.filter( comment => comment.productId.equals(product._id) );
                const findResponseComments = userResponseComments.filter( comment => comment.productId.equals(product._id) );

                if (findComments && !findResponseComments) {
                    return {
                        userComments: findComments,
                        productName: product.name,
                        productId: product._id,
                        productTotalRating: product.totalRating,
                        productCountRating: product.countRating,
                        productImg: product.img,
                        productShortDescription: product.shortDescription,
                        price: product.price,
                    }
                } else if (!findComments && findResponseComments) {
                    return {
                        userComments: findResponseComments,
                        productName: product.name,
                        productId: product._id,
                        productTotalRating: product.totalRating,
                        productCountRating: product.countRating,
                        productImg: product.img,
                        productShortDescription: product.shortDescription,
                        price: product.price,
                    }
                } if (findComments && findResponseComments) {
                    return {
                        userComments: new Array().concat(findResponseComments, findComments),
                        productName: product.name,
                        productId: product._id,
                        productTotalRating: product.totalRating,
                        productCountRating: product.countRating,
                        productImg: product.img,
                        productShortDescription: product.shortDescription,
                        price: product.price,
                    }
                }
                return product
            })

            res.json(transformComments);
        } catch (e) {
            console.log(e)
            res.json({message: e.message})
        }
    }

    async responseCommentUser (req, res) {
        try {
            const {commentUserId, mainCommentUserId, commentData, commentDate, productId} = req.body;

            const accessToken = req.cookies.accessToken;
            const token = jwt.verify(accessToken, process.env.SECRET_KEY);

            const isValidData = sanitizedData(commentData);
            const isValidProductId = sanitizedData(productId);
            const isValidCommentUserId = sanitizedData(commentUserId);
            const isValidMainCommentUserId = sanitizedData(mainCommentUserId);
            const isValidDate = sanitizedData(commentDate);

            if (isValidData.length === 0 || isValidMainCommentUserId.length === 0 || isValidDate.length === 0 || isValidProductId.length === 0 || isValidCommentUserId.length === 0) {
                return res.status(403).json({
                    error: {
                        title: "Некоректні дані",
                        data: "На жаль, введені дані заборонені у використанні"
                    }
                })
            }

            const commentId = await CommentModel.findOne({productId: isValidProductId});

            const checkOrder = await OrderModel.findOne({
                userId: token.userId,
                products: {
                    $elemMatch: {
                        _id: isValidProductId
                    }
                }
            });

            const selectProduct = checkOrder?.products.find(value => value._id == isValidProductId)

            const isGetOrder = selectProduct?.isGetOrder;

            let pushResponseComment

            let userData;
            userData = await CommentUserModel.findOne({_id: isValidCommentUserId});

            if (!userData) {
                userData = await ResponseCommentUser.findOne({_id: isValidCommentUserId});
            }

            if (isGetOrder) {
                pushResponseComment = {
                    productId: isValidProductId,
                    userId: token.userId,
                    commentUserId: isValidCommentUserId,
                    username: token.username,
                    sendTo: userData.username + ` - ${userData.commentData.slice(0, 12)}...`,
                    isGetOrder: true,
                    commentData: isValidData,
                    commentDate: isValidDate,
                }
            } else {
                pushResponseComment = {
                    productId: isValidProductId,
                    userId: token.userId,
                    commentUserId: isValidCommentUserId,
                    username: token.username,
                    sendTo: userData.username + ` - ${userData.commentData.slice(0, 12)}...`,
                    isGetOrder: false,
                    commentData: isValidData,
                    commentDate: isValidDate,
                }
            }

            const responseComment = new ResponseCommentUser(pushResponseComment)
            await responseComment.save()

            if (userData.responseComments) {
                await CommentUserModel.findByIdAndUpdate(isValidCommentUserId, {
                    $push: {
                        responseComments: responseComment
                    }
                })
            } else {
                await CommentModel.findOne({productId: isValidProductId});

                await CommentUserModel.findByIdAndUpdate(isValidCommentUserId, {
                    $push: {
                        responseComments: responseComment
                    }
                })
            }

            const userResult = await CommentModel.findOneAndUpdate(
                {
                    _id: commentId,
                    "comments._id": isValidMainCommentUserId
                },
                {
                    $push: {
                        "comments.$.responseComments": responseComment
                    }
                }
            );

            if (!userResult) {
                await GoogleUserModel.findOneAndUpdate(
                    {
                        _id: commentId,
                        "comments._id": isValidCommentUserId
                    },
                    {
                        $push: {
                            "comments.$.responseComments": responseComment
                        }
                    }
                );
            }

            const transporter = nodemailer.createTransport({
                service: "gmail",
                auth: {
                    type: "message",
                    user: process.env.EMAIL,
                    pass: process.env.PASSWORD
                }
            })

            const user = await UserModel.findOne({_id: userData.userId});

            if (user) {
                const isValidEmail = sanitizedData(user.email);

                if ( isValidEmail.length === 0 ) {
                    return res.status(500).json({
                        error: {
                            title: "Виникла помилка",
                            data: "На жаль, на сервері сталася помилка :("
                        }
                    })
                }

                const mailOptions = {
                    from: process.env.EMAIL,
                    to: isValidEmail,
                    subject: "Відповідь на ваш коментар",
                    html: `
                        <!DOCTYPE html>
                        <html lang="en">
                        <head>
                            <meta charset="UTF-8">
                            <meta http-equiv="X-UA-Compatible" content="IE=edge">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <title>Ответ на сайте Lin-Store</title>
                        </head>
                        <body style="font-family: 'Arial', sans-serif; margin: 0; padding: 0; background-color: #f4f4f4;">
                
                            <div style="max-width: 600px; margin: 20px auto; padding: 20px; background-color: #ffffff; border-radius: 10px; box-shadow: 0 0 10px rgba(145,141,141,0.1);">
                                <h2 style="color: #333;">Вітаю, ${userData.username}!</h2>
                                <p style="color: #555;">Ви отримали відповідь на свій коментар на сайті Lin-Store.</p>
                                <div style="background-color: #f8f8f8; padding: 15px; border-radius: 8px; margin-top: 15px;">
                                    <p style="color: #777; font-size: 14px;">Ваш коментар:</p>
                                    <p style="color: #333; font-size: 16px;">${userData.commentData}</p>
                                </div>
                                <div style="background-color: #f8f8f8; padding: 15px; border-radius: 8px; margin-top: 15px;">
                                    <p style="color: #777; font-size: 14px;">Для відповіді відвідайте сторінку з вашим коментарем/відгуком</p>
                                </div>
                                <p style="color: #555; margin-top: 15px;">Якщо ви отримали цей лист помилково, просимо вас проігнорувати його.</p>
                            </div>
                
                        </body>
                        </html>
                    `
                };

                await transporter.sendMail(mailOptions);

                return res.json("ok");
            }

            const googleUser = await GoogleUserModel.findOne({_id: userData.userId});

            const isValidEmail = sanitizedData(googleUser.email);

            if ( isValidEmail.length === 0 ) {
                return res.status(500).json({
                    error: {
                        title: "Виникла помилка",
                        data: "На жаль, на сервері сталася помилка :("
                    }
                })
            }

            const mailOptions = {
                from: process.env.EMAIL,
                to: isValidEmail,
                subject: "Відповідь на ваш коментар",
                html: `
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta http-equiv="X-UA-Compatible" content="IE=edge">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Ответ на сайте Lin-Store</title>
                    </head>
                    <body style="font-family: 'Arial', sans-serif; margin: 0; padding: 0; background-color: #f4f4f4;">
            
                        <div style="max-width: 600px; margin: 20px auto; padding: 20px; background-color: #ffffff; border-radius: 10px; box-shadow: 0 0 10px rgba(145,141,141,0.1);">
                            <h2 style="color: #333;">Вітаю, ${userData.username}!</h2>
                            <p style="color: #555; font-size: 17px">Ви отримали відповідь на свій коментар на сайті Lin-Store.</p>
                            <div style="background-color: #f8f8f8; padding: 15px; border-radius: 8px; margin-top: 15px;">
                                <p style="color: #777; font-size: 16px;">Ваш коментар:</p>
                                <p style="color: #333; font-size: 17px;">${userData.commentData}</p>
                            </div>
                            <div style="background-color: #f8f8f8; padding: 15px; border-radius: 8px; margin-top: 10px;">
                                <p style="color: #777; font-size: 14px;">Для відповіді відвідайте сторінку з вашим коментарем/відгуком</p>
                            </div>
                            <p style="color: #555; margin-top: 16px;">Якщо ви отримали цей лист помилково, просимо вас проігнорувати його.</p>
                        </div>
                    </body>
                    </html>
                    `
            };
            await transporter.sendMail(mailOptions);

            res.json("ok");
        } catch (e) {
            console.log(e)
            res.json({message: e.message})
        }
    }

    async changeResponseCommentUser(req, res) {
        try {
            const { responseCommentUserId, commentUserId, commentData } = req.body;

            const accessToken = req.cookies.accessToken;
            const token = jwt.verify(accessToken, process.env.SECRET_KEY);

            const isValidData = sanitizedData(commentData);
            const isValidResponseCommentUserId = sanitizedData(responseCommentUserId);
            const isValidCommentUserId = sanitizedData(commentUserId);

            if ( isValidData.length === 0 || isValidResponseCommentUserId.length === 0 || isValidCommentUserId.length === 0 ) {
                return res.status(403).json({
                    error: {
                        title: "Некоректні дані",
                        data: "На жаль, введені дані заборонені у використанні"
                    }
                })
            }

            const responseComment = await ResponseCommentUser.findByIdAndUpdate(isValidResponseCommentUserId, {
                $set: {
                    commentData: isValidData,
                    isChanged: true
                }
            }, {
                new: true
            });

            await CommentUserModel.updateOne(
                { "_id": isValidCommentUserId, "responseComments._id": isValidResponseCommentUserId },
                { "$set": { "responseComments.$": responseComment } }
            );

            await CommentModel.updateOne(
                { "comments.responseComments._id": isValidResponseCommentUserId },
                { "$set": { "comments.$[commentUser].responseComments.$[comment]": responseComment } },
                { "arrayFilters": [{ "commentUser._id": isValidCommentUserId }, { "comment._id": isValidResponseCommentUserId }] }
            );

            res.json("ok");
        } catch (e) {
            res.json({ message: e.message });
        }
    }

    async removeComment (req, res) {
        try {
            const {productId, commentUserId, commentDate} = req.body;

            const accessToken = req.cookies.accessToken;
            const token = jwt.verify(accessToken, process.env.SECRET_KEY);

            const isValidDate = sanitizedData(commentDate);
            const isValidСommentUserId = sanitizedData(commentUserId);
            const isValidProductId = sanitizedData(productId);

            if ( isValidDate.length === 0 || isValidСommentUserId.length === 0 || isValidProductId.length === 0 ) {
                return res.status(403).json({
                    error: {
                        title: "Некоректні дані",
                        data: "На жаль, введені дані заборонені у використанні"
                    }
                })
            }

            const comment = await CommentModel.findOne({productId: isValidProductId});

            await CommentUserModel.findOneAndUpdate(
                { _id: isValidСommentUserId },
                {
                    $set: {
                        commentData: `відгук був видалений користувачем ${isValidDate}`,
                        isRemove: true
                    }
                },
                { new: true }
            );

            const rewriteCommentUser = comment.comments.map(( comment ) => {
                if (comment._id == isValidСommentUserId) {
                    comment.commentData = `відгук був видалений користувачем ${isValidDate}`;

                    comment.isRemove = true;
                    return comment;
                } else {
                    return comment
                }
            })

            await CommentModel.findByIdAndUpdate(comment._id, {
                productId: isValidProductId,
                comments: rewriteCommentUser
            });

            res.json("ok");
        } catch (e) {
            res.json({message: e.message})
        }
    }

    async removeResponseCommentUser (req, res) {
        try {
            const {productId, responseCommentId, commentUserId, commentDate} = req.body;

            const accessToken = req.cookies.accessToken;
            const token = jwt.verify(accessToken, process.env.SECRET_KEY);

            const isValidDate = sanitizedData(commentDate);
            const isValidResponseCommentId = sanitizedData(responseCommentId);
            const isValidProductId = sanitizedData(productId);
            const isValidCommentUserId = sanitizedData(commentUserId);

            if ( isValidDate.length === 0 ||
                isValidResponseCommentId.length === 0 ||
                isValidProductId.length === 0 ||
                isValidCommentUserId.length === 0) {
                return res.status(403).json({
                    error: {
                        title: "Некоректні дані",
                        data: "На жаль, введені дані заборонені у використанні"
                    }
                })
            }

            const responseComment = await ResponseCommentUser.findOneAndUpdate(
                {_id: isValidResponseCommentId},
                { $set: {commentData: `Відгук було видалено ${isValidDate}`, isRemove: true }},
                { new: true}
            )

            await CommentUserModel.updateOne(
                { "_id": isValidCommentUserId, "responseComments._id": isValidResponseCommentId },
                { "$set": { "responseComments.$": responseComment } }
            );

            await CommentModel.updateOne(
                {productId: isValidProductId},
                {"$set": {"comments.$[comment].responseComments.$[responseComment]": responseComment}},
                {"arrayFilters": [{"comment._id": isValidCommentUserId}, {"responseComment._id": isValidResponseCommentId}]}
            )

            res.json("ok")
        } catch (e) {
            res.json({message: e.message})
        }
    }

    async changeComment (req, res) {
        try {
            const {productId, commentUserId, commentData} = req.body;

            const accessToken = req.cookies.accessToken;
            const token = jwt.verify(accessToken, process.env.SECRET_KEY);

            const isValidData = sanitizedData(commentData);
            const isValidProductId = sanitizedData(productId);
            const isValidCommentUserId = sanitizedData(commentUserId);

            if ( isValidData.length === 0 ||
                isValidProductId.length === 0 ||
                isValidCommentUserId.length === 0
            ) {
                return res.status(403).json({
                    error: {
                        title: "Некоректні дані",
                        data: "На жаль, введені дані заборонені у використанні"
                    }
                })
            }

            const isExist = await CommentUserModel.findOne({
                _id: isValidCommentUserId,
                userId: token.userId
            })

            if (!isExist) {
                return res.json("у вас немає прав для цього")
            }

            if (isExist.isRemove) {
                return res.json("віддалений відгук не може бути змінено")
            }

            const comment = await CommentModel.findOne({productId: isValidProductId});

            const userComment = await CommentUserModel.findOneAndUpdate(
                { _id: isValidCommentUserId },
                {
                    $set: {
                        commentData: isValidData,
                        isChanged: true,
                    }
                },
                { new: true }
            );

            const rewriteCommentUser = comment.comments.map(( comment ) => {
                if (comment._id == isValidCommentUserId) {
                    comment = userComment;
                    return comment;
                } else {
                    return comment
                }
            })

            await CommentModel.findByIdAndUpdate(comment._id, {
                productId: isValidProductId,
                comments: rewriteCommentUser
            });

            res.json("ok");
        } catch (e) {
            res.json({message: e.message})
        }
    }
}

module.exports = new CommentController();