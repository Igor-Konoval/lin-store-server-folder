const {Schema, model} = require("mongoose")

const SaveList = new Schema({
    productsId: [{type: Schema.Types.ObjectId, ref: "Product"}],
    userId: {type: Schema.Types.ObjectId, ref: "User"}
})

module.exports = model("SaveList", SaveList);