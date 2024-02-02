const { model, Schema } = require("mongoose");

const OldViews = new Schema({
    productsId: [{ type: Schema.Types.ObjectId, ref: "Product", limit: 25 }],
    userId: { type: Schema.Types.ObjectId, ref: "User" }
})

module.exports = model("OldViews", OldViews);