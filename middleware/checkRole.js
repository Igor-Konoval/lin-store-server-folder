const jwt = require('jsonwebtoken');

module.exports = function(role) {
    return function(req, res, next) {
        try {
            const accessToken = req.cookies.accessToken;

            if (!accessToken) {
                return res.json("не авторизован");
            }

            const payload = jwt.verify(accessToken, process.env.SECRET_KEY);

            if (payload.role !== role) {
                return res.status(403).json("нет доступа");
            }

            next();
        } catch (e) {
            console.log(e.message);
            res.status(401).json("не авторизован");
        }
    }
}

