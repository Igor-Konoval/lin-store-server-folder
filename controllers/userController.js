const UserModel = require('../models/User')
const BasketModel = require('../models/Basket')
const ApiError = require('../error/error')
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const {updateToken, generateAccessToken, generateRefreshToken} = require("../helpers/authHelpers")
const TokenModel = require("../models/Token");
const RoleModel = require("../models/Role");
const OldViewsModel = require("../models/OldViews");
const SaveListModel = require("../models/SaveModel");
const GoogleUserModel = require("../models/GoogleUser");
const nodemailer = require("nodemailer");
const uuid = require("uuid");
const validator = require('validator');
const sanitizedData = require("../helpers/sanitizedHelpers");

class UserController {
    async login(req, res, next){
        res.setHeader('Cache-Control', 's-max-age=1, stale-while-revalidate');
        res.setTimeout(30000);
        let {email, password, fingerprint} = req.body;

        const isValidEmail = sanitizedData(email);
        const isValidPassword = sanitizedData(password);
        const isValidFingerPrint = sanitizedData(fingerprint);
        const countFailAuth = sanitizedData(req.cookies.countFailAuth) || { count: 0, blockAuth: 0 };

        try {
            if (isValidEmail.length === 0 || !validator.isEmail(isValidEmail) || isValidPassword.length === 0 || isValidFingerPrint.length === 0 || !countFailAuth ) {
                return next(ApiError.badRequest("Некоректні поля"))
            }

            if (countFailAuth.count >= 4 && countFailAuth.blockAuth > Date.now()) {
                const timeLeft = Math.ceil((countFailAuth.blockAuth - Date.now()) / 1000 / 60);
                return next(ApiError.unauthorized(`Перевищено кількість спроб авторизації, буде доступно через ${timeLeft} хвилини`))
            } else if (countFailAuth.count >= 4 && countFailAuth.blockAuth < Date.now()) {
                countFailAuth.count = 0;
                countFailAuth.blockAuth = 0;
            }

            const user = await UserModel.findOne({email: isValidEmail});
            if (!user) {
                return next(ApiError.unauthorized("Користувача з таким email не існує"));
            }

            const googleUser = await GoogleUserModel.findOne({email: isValidEmail});
            if (googleUser) {
                return next(ApiError.unauthorized("Даний email не може бути використаний у цій авторизації"));
            }

            const checkValidPassword = bcrypt.compareSync(isValidPassword, user.password);
            if (!checkValidPassword) {
                if (countFailAuth.count < 3) {
                    res.cookie('countFailAuth', {count: countFailAuth.count + 1, blockAuth: 0}, { httpOnly: true, maxAge: 240000, secure: true, sameSite: 'None' });
                    return next(ApiError.unauthorized("Невірний пароль"));
                } else {
                    const date = new Date();
                    res.cookie('countFailAuth', {count: 4, blockAuth: date.setMinutes(date.getMinutes() + 3)}, { httpOnly: true, maxAge: 240000, secure: true, sameSite: 'None' });
                    return next(ApiError.unauthorized("Невірний пароль, перевищена кількість спроб авторизації, буде доступно через 4 хвилини"));
                }
            }

            const tokens = await updateToken(user._id,  user.username, user.role, isValidFingerPrint, null);
            res.cookie('countFailAuth', {count: countFailAuth.count, blockAuth: 0}, { httpOnly: true, maxAge: 240000, secure: true, sameSite: 'None' });
            res.cookie('refreshToken', tokens.refreshToken, { httpOnly: true, maxAge: 15 * 24 * 60 * 60 * 1000, secure: true, sameSite: 'None' });
            res.cookie('accessToken', tokens.accessToken, { httpOnly: true, expires: new Date(Date.now() + 30 * 60 * 1000), secure: true, sameSite: 'None' });
            return res.json(`ok ${tokens.accessToken}`);
        } catch (e) {
            console.log("Login error:", e);
            return res.json({message: e.message});
        }
    }

    async registration(req, res, next){
        try {
            res.setHeader('Cache-Control', 's-max-age=1, stale-while-revalidate');

            let {email, username, password, fingerprint} = req.body;

            if (!username || !password || !email) {
                return next(ApiError.badRequest("Некоректні поля"));
            }

            const isValidEmail = sanitizedData(email)
            const isValidUsername = sanitizedData(username)
            const isValidPassword = sanitizedData(password)
            const isValidFingerprint = sanitizedData(fingerprint)

            if (
                isValidEmail.length === 0 ||
                !validator.isEmail(isValidEmail) ||
                isValidUsername.length === 0 ||
                isValidPassword.length === 0 ||
                isValidFingerprint.length === 0 ) {
                return next(ApiError.badRequest("Некоректні поля"));
            }

            if (isValidUsername.length === 0 || isValidUsername.length > 20 ) {
                return next(ApiError.unauthorized('ваш логін має неприпустиму кількість символів, він має складатися з 1-20 символів'));
            }

            if (isValidPassword.length < 6) {
                return next(ApiError.unauthorized('пароль має бути від 6 символів'));
            }

            const isExists = await UserModel.findOne({email: isValidEmail});
            if (isExists) {
                return next(ApiError.unauthorized('Користувач із таким email вже існує'));
            }

            const isGoogleUserExists = await GoogleUserModel.findOne({email: isValidEmail});
            if (isGoogleUserExists) {
                return next(ApiError.unauthorized('Користувач із таким email вже існує'));
            }

            const hashPassword = bcrypt.hashSync(isValidPassword, 5);

            const roleAdmin = await RoleModel.findOne({role: "User"});

            const user = new UserModel({email: isValidEmail, username: isValidUsername, password: hashPassword, role: roleAdmin.role});
            await user.save();

            const basketUsers = new BasketModel({userId: user._id});
            await basketUsers.save();

            const oldViews = new OldViewsModel({userId: user._id});
            await oldViews.save();

            const userSaveList = await new SaveListModel({userId: user._id})
            await userSaveList.save()

            const accessToken = generateAccessToken(user._id, isValidUsername, user.role);
            const refreshToken = generateRefreshToken(isValidFingerprint);
            await TokenModel.create({ tokenId: refreshToken.id, createdAt: new Date(), userId: user._id, fingerprint: isValidFingerprint });

            await UserModel.findByIdAndUpdate(user._id, { $set: { basketId: basketUsers._id} });

            res.cookie('refreshToken', refreshToken.token, { httpOnly: true, maxAge: 15 * 24 * 60 * 60 * 1000, secure: true, sameSite: 'None' });
            res.cookie('accessToken', accessToken, { httpOnly: true, expires: new Date(Date.now() + 30 * 60 * 1000), secure: true, sameSite: 'None' });

            return res.json(`ok ${accessToken}`);
        } catch (e) {
            res.json({message: e.message});
        }
    }

    async googleAuth (req, res, next){
        try {
            res.setHeader('Cache-Control', 's-max-age=1, stale-while-revalidate');
            res.setTimeout(30000);
            let {email, username, verifiedEmail, uid, fingerprint} = req.body;
            if ( !username || !email || !uid ) {
                return next(ApiError.badRequest("Помилка наданих полів"));
            }

            const isValidEmail = sanitizedData(email)
            const isValidUsername = sanitizedData(username)
            const isValidFingerprint = sanitizedData(fingerprint)
            const isValidVerifiedEmail = sanitizedData(verifiedEmail)
            const isValidUid = sanitizedData(uid)

            if (
                isValidEmail.length === 0 ||
                isValidUsername.length === 0 ||
                isValidFingerprint.length === 0 ||
                isValidVerifiedEmail.length === 0 ||
                isValidUid.length === 0 ) {
                return next(ApiError.badRequest("Некоректні поля"));
            }

            const isExists = await GoogleUserModel.findOne({uid: isValidUid});

            if (!isExists) {
                const roleUser = await RoleModel.findOne({role: "User"});

                const user = new GoogleUserModel({ uid: isValidUid, email: isValidEmail, username: isValidUsername, verifiedEmail: isValidVerifiedEmail, role: roleUser.role });
                await user.save();

                const basketUsers = new BasketModel({userId: user._id});
                await basketUsers.save();

                const oldViews = new OldViewsModel({userId: user._id});
                await oldViews.save();

                const userSaveList = await new SaveListModel({userId: user._id})
                await userSaveList.save()

                const accessToken = generateAccessToken(user._id, isValidUsername, user.role);
                const refreshToken = generateRefreshToken(isValidFingerprint);

                await TokenModel.create({ tokenId: refreshToken.id, createdAt: new Date(), userId: user._id, fingerprint: isValidFingerprint });

                await GoogleUserModel.findByIdAndUpdate(user._id, { $set: { basketId: basketUsers._id} });

                res.cookie('refreshToken', refreshToken.token, { httpOnly: true, maxAge: 15 * 24 * 60 * 60 * 1000, secure: true, sameSite: 'None' });
                res.cookie('accessToken', accessToken, { httpOnly: true, expires: new Date(Date.now() + 30 * 60 * 1000), secure: true, sameSite: 'None' });
                // res.setHeader("Authorization", `bearer ${accessToken}`)

                return res.json(`ok ${accessToken}`);
            }

            const tokens = await updateToken(isExists._id, isExists.username, isExists.role, isValidFingerprint, null);
            res.cookie('refreshToken', tokens.refreshToken, { httpOnly: true, maxAge: 15 * 24 * 60 * 60 * 1000, secure: true, sameSite: 'None'});
            res.cookie('accessToken', tokens.accessToken, { httpOnly: true, expires: new Date(Date.now() + 30 * 60 * 1000), secure: true, sameSite: 'None'});
            // res.setHeader("Authorization", `bearer ${tokens.accessToken}`)

            return res.json(`ok ${tokens.accessToken}`);
        } catch (e) {
            console.log(e.message)
            res.json({message: e.message});
        }
    }

    async getUserProfile (req, res) {
        try {
            res.setHeader('Cache-Control', 's-max-age=1, stale-while-revalidate');
            res.setTimeout(30000);
            const accessToken = req.cookies.accessToken;
            const token = jwt.verify(accessToken, process.env.SECRET_KEY);

            const user = await UserModel.findById(token.userId);
            if (!user) {
                const googleUser = await GoogleUserModel.findById(token.userId);
                if (!googleUser) {
                    return res.json({message: "помилка клієнта, пройдіть авторизацію"})
                }

                const googleUserData = {
                    username: googleUser.username,
                    email: googleUser.email,
                    firstname: googleUser.firstname || '',
                    lastname: googleUser.lastname || '',
                    surname: googleUser.surname || '',
                    phone: googleUser.phone || false,
                    birthday: googleUser.birthday || false,
                }

                return res.json(googleUserData)
            }

            const userData = {
                username: user.username,
                email: user.email,
                firstname: user.firstname || '',
                lastname: user.lastname || '',
                surname: user.surname || '',
                phone: user.phone || false,
                birthday: user.birthday || false,
            }

            return res.json(userData)
        } catch (e) {
            console.log(e.message)
            res.json({message: e.message})
        }
    }

    async updateUserProfile (req, res, next) {
        try {
            res.setHeader('Cache-Control', 's-max-age=1, stale-while-revalidate');

            const {newValues} = req.body;

            const isValidNewValues = sanitizedData(newValues)

            if ( isValidNewValues.length === 0 ) {
                return next(ApiError.forbidden("Некоректні поля"));
            }

            const accessToken = req.cookies.accessToken;
            const token = jwt.verify(accessToken, process.env.SECRET_KEY);

            const user = await UserModel.findById(token.userId);
            if (!user) {
                const googleUser = await GoogleUserModel.findById(token.userId);
                if (!googleUser) {
                    return res.json({message: "помилка клієнта, пройдіть авторизацію"})
                }

                const result = await GoogleUserModel.findByIdAndUpdate(token.userId, isValidNewValues)
                if (!result) {
                    return res.status(500).json("Виникла помилка");
                }
                return res.json('ok')
            }

            const result = await UserModel.findByIdAndUpdate(token.userId, isValidNewValues)
            if (!result) {
                return res.status(500).json("виникла помилка");
            }

            return res.json("ok");
        } catch (e) {
            console.log(e.message)
            res.json({message: e.message})
        }
    }

    async logout(req, res) {
        try {
            res.setHeader('Cache-Control', 's-max-age=1, stale-while-revalidate');

            const refreshToken = req.cookies.refreshToken;
            const accessToken = req.cookies.accessToken;

            const decodeToken = jwt.verify(refreshToken, process.env.SECRET_KEY);

            if (!decodeToken || decodeToken.type !== "refresh") {
                res.clearCookie('accessToken', { httpOnly: true, secure: true, sameSite: 'None' });
                res.clearCookie('refreshToken', { httpOnly: true, secure: true, sameSite: 'None' });
                return res.status(400).json({ message: "Invalid token!" });
            }

            res.clearCookie('refreshToken', { httpOnly: true, secure: true, sameSite: 'None' });
            res.clearCookie('accessToken', { httpOnly: true, secure: true, sameSite: 'None' });

            await TokenModel.findOneAndRemove({tokenId: decodeToken.id});

            res.json("ok");
        } catch (e) {
            res.json(e.message)
        }
    }

    async regenerateToken(req, res, next){
        try {
            res.setHeader('Cache-Control', 's-max-age=1, stale-while-revalidate');

            const refreshToken = req.cookies.refreshToken;

            const { fingerprint } = req.body;

            const isValidFingerPrint = sanitizedData(fingerprint);

            if ( isValidFingerPrint.length === 0 ) {
                return next(ApiError.badRequest("Некоректні поля"));
            }

            if (!refreshToken) {
                res.clearCookie('accessToken', { httpOnly: true, secure: true, sameSite: 'None' });
                return res.json("пользователь")
            }
            let payload;

            payload = jwt.verify(refreshToken, process.env.SECRET_KEY);

            if (payload.type !== "refresh") {
                return res.status(400).json({ message: "Invalid token!" });
            }

            const token = await TokenModel.findOne({ tokenId: payload.id });

            if (!token) {
                return res.json("failed");
            }

            const isExistUser = await UserModel.findById(token.userId)
            const isExistGoogleUser = await GoogleUserModel.findById(token.userId)

            if (!isExistUser && !isExistGoogleUser) {
                return res.json("пользователь")
            }

            if (!token || (token.fingerprint !== isValidFingerPrint)) {
                await TokenModel.findOneAndDelete({tokenId: payload.id})
                res.clearCookie('accessToken', { httpOnly: true, secure: true, sameSite: 'None' });
                return res.clearCookie('refreshToken', { httpOnly: true, secure: true, sameSite: 'None' }).json('failed');
            }

            if (isExistUser) {
                const user = await UserModel.findOne( {_id: token.userId} )

                const tokens = await updateToken(token.userId, user.username, user.role, isValidFingerPrint, token.tokenId);

                res.cookie('refreshToken', tokens.refreshToken, { httpOnly: true, maxAge: 15 * 24 * 60 * 60 * 1000, secure: true, sameSite: 'None' });
                res.cookie('accessToken', tokens.accessToken, { httpOnly: true, expires: new Date(Date.now() + 30 * 60 * 1000), secure: true, sameSite: 'None' });
                // res.setHeader("Authorization", `bearer ${tokens.accessToken}`)

                return res.json(`ok ${tokens.accessToken}`);
            }

            const user = await GoogleUserModel.findOne( {_id: token.userId} )

            const tokens = await updateToken(isExistGoogleUser._id, isExistGoogleUser.username, isExistGoogleUser.role, isValidFingerPrint, token.tokenId);

            res.cookie('refreshToken', tokens.refreshToken, { httpOnly: true, maxAge: 15 * 24 * 60 * 60 * 1000, secure: true, sameSite: 'None' });
            res.cookie('accessToken', tokens.accessToken, { httpOnly: true, expires: new Date(Date.now() + 30 * 60 * 1000), secure: true, sameSite: 'None' });
            // res.setHeader("Authorization", `bearer ${tokens.accessToken}`)

            return res.json(`ok ${tokens.accessToken}`);
        } catch (e) {
            if (e instanceof jwt.TokenExpiredError) {
                return res.status(400).json({ message: "Token expired!" });
            } else if (e instanceof jwt.JsonWebTokenError) {
                return res.status(403).json({ message: "Invalid token!" });
            }
        }
    }

    async passwordForgot (req, res, next) {
        try {
            res.setHeader('Cache-Control', 's-max-age=1, stale-while-revalidate');

            const {email} = req.body;

            const isValidEmail = sanitizedData(email);

            if ( isValidEmail.length === 0 || !validator.isEmail(isValidEmail) ) {
                return res.json("такої пошти не існує")
            }

            const user = await UserModel.findOne({ email: isValidEmail })
            if (!user) {
                return res.json("такої пошти не існує")
            }

            const hashLink = uuid.v4();
            const transporter = nodemailer.createTransport({
                service: "gmail",
                auth: {
                    type: "password",
                    user: process.env.EMAIL,
                    pass: process.env.PASSWORD
                }
            })

            const mailOptions = {
                from: process.env.EMAIL,
                to: isValidEmail,
                subject: "Відновлення паролю",
                text: `<div>Lin Store відновлення паролю</div>`,
                html: `
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta http-equiv="X-UA-Compatible" content="IE=edge">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Відновлення паролю</title>
                    </head>
                    <body style="font-family: 'Arial', sans-serif; margin: 0; padding: 0;">
                    
                        <div style="max-width: 800px; margin: 20px auto; padding: 20px; background-color: #f4f4f4; border-radius: 10px; box-shadow: 0 0 10px rgba(145,141,141,0.1);">
                            <p style="color: #555;">Ви отримали цей лист, тому що запросили відновлення пароля для вашого облікового запису.</p>
                            <p style="color: #555;">Щоб продовжити процес, натисніть наступне посилання для відновлення пароля:</p>
                            <a href="${process.env.CLIENT_APP}recovery/${hashLink}" style="display: block; margin-top: 10px; padding: 10px; background-color: #007bff; color: #fff; text-decoration: none; border-radius: 5px; text-align: center;">Відновити пароль</a>
                            <p style="color: #555;">Якщо це були не ви, проігноруйте це повідомлення.</p>
                            <p style="color: #555; margin-top: 20px;">Посилання дійсне 5 хвилин з моменту відправки.</p>
                        </div>
                    
                    </body>
                </html>`
            }

            const updatePasswordDate = new Date(Date.now() + 5 * 60 * 1000)

            await UserModel.findOneAndUpdate({email: isValidEmail},{hashUpdatePassword: hashLink, updatePasswordDate})

            await transporter.sendMail(mailOptions);

            return res.json("ok");
        } catch (e) {
            console.log({message: e.message})
        }
    }

    async checkRecoveryLink (req, res, next) {
        try {
            res.setHeader('Cache-Control', 's-max-age=1, stale-while-revalidate');

            const hashLink = req.params.link.slice(1);
            const currentDate = Date.now();

            const isValidHashLink = sanitizedData(hashLink);

            if ( isValidHashLink.length === 0 ) {
                return next(ApiError.badRequest("Некоректні поля"));
            }

            const user = await UserModel.findOne({hashUpdatePassword: isValidHashLink});
            if (!user) {
                return next(ApiError.badRequest("Це посилання більше не дійсне"));
            }

            const isExpiredDate = user.updatePasswordDate;
            if (isExpiredDate < currentDate) {
                return next(ApiError.badRequest("час на оновлення пароля минув, повторіть спробу знову"));
            }

            return res.json("ok");
        } catch (e) {
            console.log({message: e.message})
        }
    }

    async updatePassword (req, res, next) {
        try {
            res.setHeader('Cache-Control', 's-max-age=1, stale-while-revalidate');

            const {password, fingerprint} = req.body;
            const hashLink = req.params.link.slice(1);
            const currentDate = Date.now();

            const isValidPassword = sanitizedData(password);
            const isValidFingerprint = sanitizedData(fingerprint);
            const isValidHashLink = sanitizedData(hashLink);

            if ( isValidPassword.length === 0 || isValidFingerprint.length === 0 || isValidHashLink.length === 0 ) {
                return next(ApiError.badRequest("Некоректні поля"));
            }

            if (!password) {
                return next(ApiError.badRequest("Некоректні поля"));
            }
            const hashPassword = bcrypt.hashSync(isValidPassword, 5);

            const user = await UserModel.findOne({hashUpdatePassword: isValidHashLink});
            if (!user) {
                return next(ApiError.badRequest("Такого користувача не існує"));
            }

            const isExpiredDate = user.updatePasswordDate;
            if (isExpiredDate < currentDate) {
                return next(ApiError.badRequest("час на оновлення пароля минув, повторіть спробу знову"));
            }

            await UserModel.findOneAndUpdate(
                {hashUpdatePassword: isValidHashLink},
                {
                    hashUpdatePassword: "",
                    updatePasswordDate: 0,
                    password: hashPassword,
                    $push: {oldPasswords: user.password}
                }
            )

            const tokens = await updateToken(user._id, user.username, user.role, isValidFingerprint);
            res.cookie('refreshToken', tokens.refreshToken, { httpOnly: true, maxAge: 15 * 24 * 60 * 60 * 1000, secure: true, sameSite: 'None' });
            res.cookie('accessToken', tokens.accessToken, { httpOnly: true, expires: new Date(Date.now() + 30 * 60 * 1000), secure: true, sameSite: 'None' });

            return res.json(`ok ${tokens.accessToken}`)
        } catch (e) {
            console.log({message: e.message})
        }
    }
}

module.exports = new UserController;