const jwt = require('jsonwebtoken');
const sanitizedData = require("../helpers/sanitizedHelpers");

module.exports = (req, res, next) => {
    try {
        const accessToken = sanitizedData(req.cookies.accessToken);
        const refreshToken = sanitizedData(req.cookies.refreshToken);
        const authBearer = sanitizedData(req.headers.authorization.split(' ')[1])
//savepoint
        if (!refreshToken || refreshToken.length === 0) {
            // res.clearCookie('refreshToken', refreshToken, { httpOnly: true, secure: true, sameSite: 'None'  });
            // res.clearCookie('accessToken', accessToken, { httpOnly: true, secure: true, sameSite: 'None' });
            return res.json("не авторизован");
        }

        if (!accessToken || accessToken.length === 0) {
            return res.json("не авторизован");
        }

        if (accessToken !== authBearer) {
            // res.clearCookie('accessToken', accessToken, { httpOnly: true, secure: true, sameSite: 'None' });
            res.json("Invalid token")
        }

        if (!authBearer || authBearer.length === 0) {
            // res.clearCookie('refreshToken', refreshToken, { httpOnly: true, secure: true, sameSite: 'None' });
            // res.clearCookie('accessToken', accessToken, { httpOnly: true, secure: true, sameSite: 'None' });
            return res.json("не авторизован");
        }


        const decodeToken = jwt.verify(accessToken, process.env.SECRET_KEY)
        const decodeAuthBearer = jwt.verify(authBearer, process.env.SECRET_KEY)
        const decodeRefreshToken = jwt.verify(refreshToken, process.env.SECRET_KEY)

        if (!decodeRefreshToken) {
            // res.clearCookie('refreshToken', refreshToken, { httpOnly: true, secure: true, sameSite: 'None' });
            // res.clearCookie('accessToken', accessToken, { httpOnly: true, secure: true, sameSite: 'None' });
            res.json("Invalid token")
        }

        if (!decodeAuthBearer) {
            // res.clearCookie('refreshToken', refreshToken, { httpOnly: true, secure: true, sameSite: 'None' });
            // res.clearCookie('accessToken', accessToken, { httpOnly: true, secure: true, sameSite: 'None' });
            res.json("Invalid token")
        }

        if(!decodeToken) {
            // res.clearCookie('accessToken', accessToken, { httpOnly: true, secure: true, sameSite: 'None' });
            res.json("Invalid token")
        }

        next();
    } catch (e) {
        res.status(401).json("не авторизован");
    }
}

