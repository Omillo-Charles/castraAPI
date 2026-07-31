import { Router } from "express";
import { getProfile, updateProfile, changePassword, deleteAccount } from "../controllers/user.controller.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { validate, updateProfileSchema, changePasswordSchema } from "../middlewares/validator.js";

const userRouter = Router();

userRouter.use(requireAuth);

userRouter.get("/me",            getProfile);
userRouter.patch("/me",          validate(updateProfileSchema),  updateProfile);
userRouter.patch("/me/password", validate(changePasswordSchema), changePassword);
userRouter.delete("/me",         deleteAccount);

export default userRouter;
