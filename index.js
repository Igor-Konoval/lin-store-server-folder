require('dotenv').config();
const express = require('express');
const mongoose = require("mongoose");
const router = require('./routes/index');
const cors = require('cors')
const bodyParser = require('body-parser');
const path = require("path");
const cookieParser = require('cookie-parser');
const handlerMiddlewareError = require("./middleware/errorMiddleware");

const app = express();
const uri = process.env.URI;
const port = process.env.PORT || '5500';

app.use(cookieParser());
app.use(cors({
    credentials: true,
    origin: process.env.CLIENT_APP,
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    // headers: ["Content-Type", "Accept", "Authorization", "X-Requested-With", "X-CSRF-Token"]
    allowedHeaders: ["Content-Type", "Accept", "Authorization", "X-Requested-With", "X-CSRF-Token"],
}));

app.set('trust proxy', 1);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.resolve(__dirname, "static")));
app.use(express.json());
app.use('/', router);
app.use(handlerMiddlewareError);

(async () => {
    try {
        app.listen(port, () => {
            console.log(`server started at port ${port}`);
        });
        await mongoose.connect(uri);
        console.log("Сервер подключился...");
    } catch (e) {
        return console.log(`server is fall ` + e);
    }
})();