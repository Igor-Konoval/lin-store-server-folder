const {model, Schema} = require("mongoose")

const Order = new Schema({
    products: [{
        _id: {type: Schema.Types.ObjectId, ref: "Product"},
        color: {type: String},
        count: {type: Number}
    }],
    userId: {type: Schema.Types.ObjectId, ref: "User", required: true},
    price: {type: Number, required: true},
    isCancel: {type: Boolean, default: false},
    status: {type: Number},
    info: [{type: String}],
    received: {type: Boolean, default: false},
    orderNumber: {type: Number, required: true},
    TTN: {type: Number},
    typeDelivery: {type: String}
});

module.exports = model("Order", Order);