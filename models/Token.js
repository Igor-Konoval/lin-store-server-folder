const {Schema, model} = require("mongoose")

const Token = new Schema({
    tokenId: {type: String, required: true},
    userId: {type: Schema.Types.ObjectId, ref: "User"},
    fingerprint: {type: String, required: true},
    createdAt: {type: Number, required: true}
})

module.exports = model("Token", Token);