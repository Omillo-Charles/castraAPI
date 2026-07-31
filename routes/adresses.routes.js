import { Router } from "express";
import { getAddresses, createAddress, updateAddress, setDefaultAddress, deleteAddress } from "../controllers/adresses.controller.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { validate, createAddressSchema, updateAddressSchema } from "../middlewares/validator.js";

const addressRouter = Router();

addressRouter.use(requireAuth);

addressRouter.get("/",              getAddresses);
addressRouter.post("/",             validate(createAddressSchema), createAddress);
addressRouter.patch("/:id",         validate(updateAddressSchema), updateAddress);
addressRouter.patch("/:id/default", setDefaultAddress);
addressRouter.delete("/:id",        deleteAddress);

export default addressRouter;
