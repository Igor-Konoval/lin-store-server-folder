const jwt = require('jsonwebtoken');
const uuid = require("uuid");
const Token = require("../models/Token");
const generateAccessToken = (userId, username, role) => {
    const payload = {
        userId,
        username,
        role,
        type: "access"
    };
    return jwt.sign(payload, process.env.SECRET_KEY, {expiresIn: '30m'})
}

const generateRefreshToken = () => {
    const payload = {
        id: uuid.v4(),
        type: "refresh"
    }
    return {
        id: payload.id,
        token: jwt.sign(payload, process.env.SECRET_KEY, {expiresIn: "15d"})
    }
}

const replaceDbRefreshToken = async (tokenId, userId, fingerprint) => {
    await Token.findOneAndRemove({userId: userId});
    await Token.create({tokenId: tokenId, createdAt: new Date(), userId: userId, fingerprint: fingerprint});
}

const updateSingleToken = async (userId, oldTokenId, newTokenId, newFingerprint) => {
    if (oldTokenId === null) {
        await Token.create({ tokenId: newTokenId, createdAt: new Date(), userId, fingerprint: newFingerprint });
    } else {
        const tokenToUpdate = await Token.findOne({ userId, tokenId: oldTokenId });

        if (tokenToUpdate) {
            tokenToUpdate.tokenId = newTokenId;
            tokenToUpdate.fingerprint = newFingerprint;
            tokenToUpdate.createdAt = new Date();
            await tokenToUpdate.save();
        } else {
            await Token.create({ tokenId: newTokenId, createdAt: new Date(), userId, fingerprint: newFingerprint });
        }
    }
}

const updateToken = async (userId, username, userRole, fingerprint, oldRefreshTokenId) => {
    const accessToken = generateAccessToken(userId, username, userRole);
    const refreshToken = generateRefreshToken();

    const userTokens = await Token.find({ userId }).sort({ createdAt: 1 });

    if (userTokens.length > 1) {
        const tokensToDelete = userTokens.slice(0, -1);
        await Token.deleteMany({ _id: { $in: tokensToDelete.map(token => token._id) } });
    }

    await updateSingleToken(userId, oldRefreshTokenId, refreshToken.id, fingerprint);

    return {
        accessToken,
        refreshToken: refreshToken.token
    };
}

module.exports ={
    replaceDbRefreshToken,
    generateRefreshToken,
    generateAccessToken,
    updateToken
};