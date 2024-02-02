const {model, Schema} = require("mongoose");

const products = new Schema({
    productId: {type: Schema.Types.ObjectId, ref: "Product"},
    color: {type: String}
});

const Basket = new Schema({
    userId: {type: Schema.Types.ObjectId, ref: "User"},
    products: [products],
})

module.exports = model("Basket", Basket);