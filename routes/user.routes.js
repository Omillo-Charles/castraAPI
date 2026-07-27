import { Router } from "express";
import {
    getProfile,
    updateProfile,
    changePassword,
    deleteAccount,
} from "../controllers/user.controller.js";
import { requireAuth } from "../middlewares/requireAuth.js";

const userRouter = Router();

// All user routes require authentication
userRouter.use(requireAuth);

userRouter.get("/me",              getProfile);
userRouter.patch("/me",            updateProfile);
userRouter.patch("/me/password",   changePassword);
userRouter.delete("/me",           deleteAccount);

export default userRouter;
