const Router = require('express')
const router = new Router()
const userController = require('../controllers/userController')
const authCheck = require('../middleware/authCheck');

router.post('/auth', userController.regenerateToken);
router.post('/registration', userController.registration);
router.post('/login', userController.login);
router.post('/googleAuthUser', userController.googleAuth);
router.post('/passwordForgot', userController.passwordForgot);
router.get('/checkRecoveryLink/:link', userController.checkRecoveryLink);
router.post('/recoveryPassword/:link', userController.updatePassword);
router.get('/userProfile', authCheck, userController.getUserProfile);
router.put('/userProfile', authCheck, userController.updateUserProfile);
router.get('/logout', userController.logout);

module.exports = router;
