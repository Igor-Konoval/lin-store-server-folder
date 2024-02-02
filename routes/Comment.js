const Router = require("express");
const router = new Router();
const CommentController = require("../controllers/commentController");
const authCheck = require("../middleware/authCheck");

router.post("/", authCheck, CommentController.createComment);
router.get("/commentsUser", authCheck, CommentController.commentsUser);
router.get("/:id", CommentController.getAllComments);
router.post("/responseComment", authCheck, CommentController.responseCommentUser);
router.post("/removeComment", authCheck, CommentController.removeComment)
router.post("/changeComment", authCheck, CommentController.changeComment)
router.post("/changeResponseComment", authCheck, CommentController.changeResponseCommentUser);
router.post("/removeResponseComment", authCheck, CommentController.removeResponseCommentUser);

module.exports = router;