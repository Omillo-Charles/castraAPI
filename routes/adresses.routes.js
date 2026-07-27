import { Router } from "express";
import {
    getAddresses,
    createAddress,
    updateAddress,
    setDefaultAddress,
    deleteAddress,
} from "../controllers/adresses.controller.js";
import { requireAuth } from "../middlewares/requireAuth.js";

const addressRouter = Router();

// All address routes require authentication
addressRouter.use(requireAuth);

addressRouter.get("/",              getAddresses);
addressRouter.post("/",             createAddress);
addressRouter.patch("/:id",         updateAddress);
addressRouter.patch("/:id/default", setDefaultAddress);
addressRouter.delete("/:id",        deleteAddress);

export default addressRouter;
