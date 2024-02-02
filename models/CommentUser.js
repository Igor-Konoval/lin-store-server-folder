const {model, Schema} = require("mongoose");

const ResponseCommentUser = new Schema({
    productId: {type: Schema.Types.ObjectId, ref: "Product"},
    userId: {type: Schema.Types.ObjectId, ref: "Type", required: true},
    commentUserId: {type: Schema.Types.ObjectId, ref: "CommentUser"},
    username: {type: String},
    sendTo: {type: String},
    isGetOrder: {type: Boolean, default: false},
    isRemove: {type: Boolean, default: false},
    commentData: {type: String},
    commentDate: {type: String},
    isChanged: {type: Boolean, default: false}
})

const CommentUser = new Schema({
    productId: {type: Schema.Types.ObjectId, ref: "Product"},
    userId: {type: Schema.Types.ObjectId, ref: "Type", required: true},
    username: {type: String},
    sendTo: {type: String},
    rating: {type: Number},
    commentData: {type: String},
    commentDate: {type: String},
    isRemove: {type: Boolean, default: false},
    isChanged: {type: Boolean, default: false},
    isGetOrder: {type: Boolean, default: false},
    responseComments: [ResponseCommentUser]
})

module.exports = {
    CommentUserModel: model("CommentUser", CommentUser),
    SchemaCommentUser: CommentUser,
    ResponseCommentUser: model("ResponseCommentUser", ResponseCommentUser)
}