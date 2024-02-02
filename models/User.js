const {model, Schema} = require("mongoose");

const User = new Schema({
    email: {type: String, required: true, unique: true},
    username: {type: String, required: true},
    password: {type: String, required: true},
    firstname: {type: String},
    lastname: {type: String},
    surname: {type: String},
    phone: {type: Number},
    birthday: {type: Date},
    role: {type: String, ref: "Role"},
    basketId: {type: Schema.Types.ObjectId, ref: "Basket"},
    commentsId: [{type: Schema.Types.ObjectId, ref: "Comment"}],
    ratings: [{type: Schema.Types.ObjectId, ref: "Rating"}],
    hashUpdatePassword: {type: String},
    updatePasswordDate: {type: Date},
    oldPasswords: [{type: String}]
})

module.exports = model("User", User);