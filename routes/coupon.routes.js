import { Router } from "express";
import {
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  getCoupon,
  applyCoupon,
} from "../controllers/coupon.controller.js";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth.js";
import { resolveCart } from "../middlewares/resolveCart.js";
import { validate, applyCouponSchema, createCouponSchema, updateCouponSchema } from "../middlewares/validator.js";

const couponRouter = Router();

couponRouter.use(resolveCart);

couponRouter.post("/apply", validate(applyCouponSchema), applyCoupon);
couponRouter.get("/", requireAuth, requireAdmin, listCoupons);
couponRouter.post("/", requireAuth, requireAdmin, validate(createCouponSchema), createCoupon);
couponRouter.get("/:id", requireAuth, requireAdmin, getCoupon);
couponRouter.patch("/:id", requireAuth, requireAdmin, validate(updateCouponSchema), updateCoupon);
couponRouter.delete("/:id", requireAuth, requireAdmin, deleteCoupon);

export default couponRouter;
