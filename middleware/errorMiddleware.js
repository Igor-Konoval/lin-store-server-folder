const ApiError = require("../error/error");

module.exports = (error, req, res, next) => {
    try {
        if (error instanceof ApiError) {
            return res.status(error.status).json({message: error.message});
        }
        return res.status(500).json({message: "Непредвиденная ошибка"})
    } catch (e) {
        console.log(e.message)
    }
}