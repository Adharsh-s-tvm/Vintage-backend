import express from "express";

import { addProduct, getAllProducts, addVariant, addCategory, getAllCategories, updateCategoryStatus, updateCategory, addBrand, getAllBrands, updateBrandStatus, updateBrand, getProductVariants, deleteVariant, updateProduct, updateProductStatus, updateVariant, updateProductBlockStatus, updateVariantBlockStatus, getAllCategoriesWithoutPagination, getAllBrandsWithoutPagination } from "../../controllers/admin/adminProductController.js";
import asyncHandler from "../../middlewares/asyncHandler.js";
import { handleUpload } from "../../middlewares/multer.js";

const   router = express.Router();



// Admin: Add Product
router.post("/add", asyncHandler(addProduct));

// Get All Products
router.get("/", asyncHandler(getAllProducts));

router.post("/variant/add",

    handleUpload,
    asyncHandler(addVariant)
);

router.get("/product/:productId/variants",
    asyncHandler(getProductVariants)
);

router.delete("/variant/:variantId",
    asyncHandler(deleteVariant)
);

// Category Routes
router.post("/category/add", asyncHandler(addCategory));
router.get("/categories", asyncHandler(getAllCategories));
router.get("/categories/all", asyncHandler(getAllCategoriesWithoutPagination));
router.put("/category/:id/status", asyncHandler(updateCategoryStatus));
router.put("/category/:id", asyncHandler(updateCategory));

// Brand Routes
router.post("/brand/add", asyncHandler(addBrand));
router.get("/brands", asyncHandler(getAllBrands));
router.get('/brands/all', getAllBrandsWithoutPagination);
router.put("/brand/:id/status", asyncHandler(updateBrandStatus));
router.put("/brand/:id", asyncHandler(updateBrand));

router.put("/:id",
    asyncHandler(updateProduct)
);

// Update product status
router.put("/product/:id/status", asyncHandler(updateProductStatus));

// Update variant
router.put("/variant/:variantId", 
  handleUpload,
  asyncHandler(updateVariant)
);

// Block/unblock product
router.put("/product/:id/block", asyncHandler(updateProductBlockStatus));

// Block/unblock variant
router.put("/variant/:variantId/block", asyncHandler(updateVariantBlockStatus));

export default router