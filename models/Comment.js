const {model, Schema} = require("mongoose");
const {SchemaCommentUser} = require("./CommentUser");

const Comment = new Schema({
    productId: {type: Schema.Types.ObjectId, ref: "Product"},
    comments: [SchemaCommentUser],
})

module.exports = model("Comment", Comment);