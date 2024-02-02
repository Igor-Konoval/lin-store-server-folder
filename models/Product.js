const {model, Schema, SchemaType} = require("mongoose")

const descriptionSchema = new Schema({
    title: { type: String },
    description: { type: String },
});

const colorsSchema = new Schema({
    color: { type: String },
    count: { type: Number },
    urlImg: { type: String },
});

const Product = new Schema({
    name: { type: String, required: true },
    description: [descriptionSchema],
    shortDescription: {type: String},
    typeId: { type: Schema.Types.ObjectId, ref: "Type", required: true },
    brandId: { type: Schema.Types.ObjectId, ref: "Brand", required: true },
    totalRating: {type: Number}, // подсчитанный средний рейтинг
    countRating: {type: Number}, // количество поставленых рейтингов
    countSales: {type: Number, default: 0},
    commentId: {type: Schema.Types.ObjectId, ref: "Comment"},
    img: [{ type: String }],
    price: { type: Number, required: true },
    wasInUsed: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    colors: [colorsSchema]
});

module.exports = model("Product", Product);