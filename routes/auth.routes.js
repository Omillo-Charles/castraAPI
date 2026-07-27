import { Router } from "express";
import { register, login, logout, getMe } from "../controllers/auth.controller.js";
import { requireAuth } from "../middlewares/requireAuth.js";

const authRouter = Router();

// Public routes
authRouter.post("/register", register);
authRouter.post("/login",    login);
authRouter.post("/logout",   logout);

// Protected — requires valid JWT
authRouter.get("/me", requireAuth, getMe);

export default authRouter;
