import express, { Router } from "express";
import asyncHandler from "../../middlewares/asyncHandler.js";
import { getAllShopBrands, getAllShopCategories, getAllShopProducts, getProductById, searchProducts } from "../../controllers/user/userProductController.js";


const router = express.Router();



router.get("/", asyncHandler(getAllShopProducts));

router.get('/categories', asyncHandler(getAllShopCategories))

router.get("/brands", asyncHandler(getAllShopBrands))

router.get('/:id', getProductById);

router.get("/search", asyncHandler(searchProducts))

export default router