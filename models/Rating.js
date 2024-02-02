const {model, Schema} = require("mongoose");

const Rating = new Schema({
    userId: {type: Schema.Types.ObjectId, ref: "User"},
    deviceId: {type: Schema.Types.ObjectId, ref: "Device"},
    ratingNum: {type: Number, default: 0}
})


module.exports = model("Rating", Rating);