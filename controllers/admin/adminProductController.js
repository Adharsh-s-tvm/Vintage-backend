import Product from "../../models/product/productModel.js";
import Variant from "../../models/product/sizeVariantModel.js";
import Category from "../../models/product/categoryModel.js";
import Brand from "../../models/product/brandModel.js";
import { HttpStatus } from "../../utils/httpStatus.js";


export const addProduct = async (req, res) => {
  try {
    const product = new Product(req.body);
    await product.save();

    // Fetch the saved product with populated fields
    const populatedProduct = await Product.findById(product._id)
      .populate('category', 'name')
      .populate('brand', 'name');

    res.status(HttpStatus.CREATED).json(populatedProduct);
  } catch (error) {
    console.error('Error adding product:', error);
    res.status(HttpStatus.BAD_REQUEST).json({ message: error.message });
  }
};

export const getAllProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const limit = parseInt(req.query.limit) || 5;
    const search = req.query.search || '';

    // Create aggregation pipeline
    const aggregationPipeline = [
      // Lookup for populating relationships
      {
        $lookup: {
          from: 'categories',
          localField: 'category',
          foreignField: '_id',
          as: 'category'
        }
      },
      {
        $lookup: {
          from: 'brands',
          localField: 'brand',
          foreignField: '_id',
          as: 'brand'
        }
      },
      {
        $lookup: {
          from: 'variants',
          localField: 'variants',
          foreignField: '_id',
          as: 'variants'
        }
      },
      // Unwind the populated arrays
      {
        $unwind: '$category'
      },
      {
        $unwind: '$brand'
      },
      // Add search query if provided
      ...(search ? [{
        $match: {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { 'brand.name': { $regex: search, $options: 'i' } },
            { 'category.name': { $regex: search, $options: 'i' } }
          ]
        }
      }] : []),
      // Sort by creation date
      {
        $sort: { createdAt: -1 }
      }
    ];

    // Get total count for pagination (before applying skip and limit)
    const totalProducts = await Product.aggregate([
      ...aggregationPipeline,
      { $count: 'total' }
    ]);

    const total = totalProducts[0]?.total || 0;

    // Add pagination to pipeline
    aggregationPipeline.push(
      { $skip: page * limit },
      { $limit: limit }
    );

    // Execute the aggregation pipeline
    const products = await Product.aggregate(aggregationPipeline);

    res.json({
      products,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      totalProducts: total,
      hasNextPage: (page + 1) * limit < total,
      hasPrevPage: page > 0
    });

  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Error fetching products' });
  }
};

export const addVariant = async (req, res) => {
  try {
    const { size, color, stock, price, product } = req.body;
    console.log('Request body:', req.body);
    console.log('Request files:', req.files);

    // Validate required fields
    if (!product || !size || !color || !stock || !price) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: "All fields are required"
      });
    }

    // Get image URLs with fallback
    let mainImageUrl = '';
    let subImageUrls = [];

    if (req.files) {
      if (req.files.mainImage && req.files.mainImage[0]) {
        mainImageUrl = req.files.mainImage[0].path || req.files.mainImage[0].secure_url;
      }
      if (req.files.subImages) {
        subImageUrls = req.files.subImages.map(file => file.path || file.secure_url);
      }
    }

    // Create new variant
    const newVariant = new Variant({
      product,
      size,
      color,
      stock: Number(stock),
      price: Number(price),
      mainImage: mainImageUrl,
      subImages: subImageUrls
    });

    const savedVariant = await newVariant.save();
    await Product.findByIdAndUpdate(
      product,
      { $push: { variants: savedVariant._id } }
    );

    const populatedVariant = await Variant.findById(savedVariant._id)
      .populate('product', 'name');

    res.status(HttpStatus.CREATED).json({
      success: true,
      message: 'Variant added successfully',
      variant: populatedVariant
    });

  } catch (error) {
    console.error('Error in addVariant:', error);
    res.status(HttpStatus.BAD_REQUEST).json({
      success: false,
      message: error.message || 'Failed to add variant'
    });
  }
};



export const addCategory = async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(HttpStatus.BAD_REQUEST).json({ message: "Category name is required" });
  }

  // Check if category already exists
  const existingCategory = await Category.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
  if (existingCategory) {
    return res.status(HttpStatus.BAD_REQUEST).json({ message: "Category already exists" });
  }

  const newCategory = new Category({
    name,
    status: "listed"
  });

  const savedCategory = await newCategory.save();
  res.status(HttpStatus.CREATED).json(savedCategory);
};



export const getAllCategories = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const search = req.query.search || '';
    const filter = req.query.filter || 'all';

    // Build filter query
    let filterQuery = {};
    
    // Add search conditions if search query exists
    if (search) {
      filterQuery.name = { $regex: search, $options: 'i' };
    }

    // Add status filter if not 'all'
    if (filter !== 'all') {
      filterQuery.status = filter;
    }

    // Get total count for pagination
    const total = await Category.countDocuments(filterQuery);

    // Calculate skip value for pagination
    const skip = (page - 1) * limit;

    // Fetch categories with filters and pagination
    const categories = await Category.find(filterQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Send response with pagination metadata
    res.json({
      categories,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalCategories: total,
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
        limit
      }
    });

  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ 
      success: false,
      message: 'Error fetching categories',
      error: error.message 
    });
  }
};

export const getAllCategoriesWithoutPagination = async (req, res) => {
  try {
    // Only fetch listed categories
    const categories = await Category.find({ status: 'listed' })
      .sort({ createdAt: -1 });

    res.json({
      categories
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ 
      success: false,
      message: 'Error fetching categories',
      error: error.message 
    });
  }
};



export const updateCategoryStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status || !['listed', 'Not listed'].includes(status)) {
    return res.status(HttpStatus.BAD_REQUEST).json({ message: "Invalid status" });
  }

  const category = await Category.findById(id);
  if (!category) {
    return res.status(HttpStatus.NOT_FOUND).json({ message: "Category not found" });
  }

  category.status = status;
  const updatedCategory = await category.save();
  res.status(HttpStatus.OK).json(updatedCategory);
};



export const updateCategory = async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  if (!name) {
    return res.status(HttpStatus.BAD_REQUEST).json({ message: "Category name is required" });
  }

  // Check if the new name already exists for other categories
  const existingCategory = await Category.findOne({
    name: { $regex: new RegExp(`^${name}$`, 'i') },
    _id: { $ne: id } // Exclude current category from check
  });

  if (existingCategory) {
    return res.status(HttpStatus.BAD_REQUEST).json({ message: "Category name already exists" });
  }

  const category = await Category.findById(id);
  if (!category) {
    return res.status(HttpStatus.NOT_FOUND).json({ message: "Category not found" });
  }

  category.name = name;
  const updatedCategory = await category.save();
  res.status(HttpStatus.OK).json(updatedCategory);
};

export const addBrand = async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(HttpStatus.BAD_REQUEST).json({ message: "Brand name is required" });
  }

  // Check if brand already exists
  const existingBrand = await Brand.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
  if (existingBrand) {
    return res.status(HttpStatus.BAD_REQUEST).json({ message: "Brand already exists" });
  }

  const newBrand = new Brand({
    name,
    status: "listed"
  });

  const savedBrand = await newBrand.save();
  res.status(HttpStatus.CREATED).json(savedBrand);
};

export const getAllBrands = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const search = req.query.search || '';
    const filter = req.query.filter || 'all';

    // Build filter query
    let filterQuery = {};
    
    // Add search conditions if search query exists
    if (search) {
      filterQuery.name = { $regex: search, $options: 'i' };
    }

    // Add status filter if not 'all'
    if (filter !== 'all') {
      filterQuery.status = filter;
    }

    // Get total count for pagination
    const total = await Brand.countDocuments(filterQuery);

    // Calculate skip value for pagination
    const skip = (page - 1) * limit;

    // Fetch brands with filters and pagination
    const brands = await Brand.find(filterQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Send response with pagination metadata
    res.json({
      brands,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalBrands: total,
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
        limit
      }
    });

  } catch (error) {
    console.error('Error fetching brands:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ 
      success: false,
      message: 'Error fetching brands',
      error: error.message 
    });
  }
};

export const updateBrandStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status || !['listed', 'Not listed'].includes(status)) {
    return res.status(HttpStatus.BAD_REQUEST).json({ message: "Invalid status" });
  }

  const brand = await Brand.findById(id);
  if (!brand) {
    return res.status(HttpStatus.NOT_FOUND).json({ message: "Brand not found" });
  }

  brand.status = status;
  const updatedBrand = await brand.save();
  res.status(HttpStatus.OK).json(updatedBrand);
};

export const updateBrand = async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  if (!name) {
    return res.status(HttpStatus.BAD_REQUEST).json({ message: "Brand name is required" });
  }

  const existingBrand = await Brand.findOne({
    name: { $regex: new RegExp(`^${name}$`, 'i') },
    _id: { $ne: id }
  });

  if (existingBrand) {
    return res.status(HttpStatus.BAD_REQUEST).json({ message: "Brand name already exists" });
  }

  const brand = await Brand.findById(id);
  if (!brand) {
    return res.status(HttpStatus.NOT_FOUND).json({ message: "Brand not found" });
  }

  brand.name = name;
  const updatedBrand = await brand.save();
  res.status(HttpStatus.OK).json(updatedBrand);
};

// Add a controller to get variants for a specific product
export const getProductVariants = async (req, res) => {
  try {
    const { productId } = req.params;

    const variants = await Variant.find({ product: productId })
      .populate('product', 'name');

    res.status(HttpStatus.OK).json(variants);
  } catch (error) {
    console.error('Error fetching variants:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Error fetching variants' });
  }
};

// Add a controller to update product
export const updateProduct = async (req, res) => {
  console.log('Update Prodict')
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Validate input data
    if (!updateData.name || !updateData.category || !updateData.brand) {
      return res.status(HttpStatus.BAD_REQUEST).json({ message: "Required fields are missing" });
    }

    // Log the update operation
    console.log('Updating product:', id, updateData);

    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('category', 'name')
      .populate('brand', 'name');

    if (!updatedProduct) {
      return res.status(HttpStatus.NOT_FOUND).json({ message: "Product not found" });
    }

    // Log the updated product
    console.log('Updated product:', updatedProduct);

    res.status(HttpStatus.OK).json(updatedProduct);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(HttpStatus.BAD_REQUEST).json({ message: error.message });
  }
};

// Add a controller to delete variant
export const deleteVariant = async (req, res) => {
  try {
    const { variantId } = req.params;

    const variant = await Variant.findById(variantId);
    if (!variant) {
      return res.status(HttpStatus.NOT_FOUND).json({ message: "Variant not found" });
    }

    // Remove variant from product's variants array
    await Product.findByIdAndUpdate(
      variant.product,
      { $pull: { variants: variantId } }
    );

    // Delete variant
    await Variant.findByIdAndDelete(variantId);

    res.status(HttpStatus.OK).json({ message: "Variant deleted successfully" });
  } catch (error) {
    console.error('Error deleting variant:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Error deleting variant' });
  }
};

// Update product status (block/unblock)
export const updateProductStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isListed } = req.body;

    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      { isListed },
      { new: true }
    ).populate('category', 'name')
      .populate('brand', 'name');

    if (!updatedProduct) {
      return res.status(HttpStatus.NOT_FOUND).json({ message: "Product not found" });
    }

    res.status(HttpStatus.OK).json(updatedProduct);
  } catch (error) {
    console.error('Error updating product status:', error);
    res.status(HttpStatus.BAD_REQUEST).json({ message: error.message });
  }
};

// Update variant
export const updateVariant = async (req, res) => {
  try {
    const { variantId } = req.params;
    const updateData = req.body;
    let mainImageUrl = '';
    let subImageUrls = [];

    // Handle image updates if files are present
    if (req.files) {
      if (req.files.mainImage && req.files.mainImage[0]) {
        mainImageUrl = req.files.mainImage[0].path || req.files.mainImage[0].secure_url;
        updateData.mainImage = mainImageUrl;
      }
      if (req.files.subImages) {
        subImageUrls = req.files.subImages.map(file => file.path || file.secure_url);
        updateData.subImages = subImageUrls;
      }
    }

    const updatedVariant = await Variant.findByIdAndUpdate(
      variantId,
      updateData,
      { new: true }
    ).populate('product', 'name');

    if (!updatedVariant) {
      return res.status(HttpStatus.NOT_FOUND).json({ message: "Variant not found" });
    }

    res.status(HttpStatus.OK).json(updatedVariant);
  } catch (error) {
    console.error('Error updating variant:', error);
    res.status(HttpStatus.BAD_REQUEST).json({ message: error.message });
  }
};

// Update product block status
export const updateProductBlockStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isBlocked } = req.body;

    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      { isBlocked },
      { new: true }
    ).populate('category', 'name')
      .populate('brand', 'name');

    if (!updatedProduct) {
      return res.status(HttpStatus.NOT_FOUND).json({ message: "Product not found" });
    }

    res.status(HttpStatus.OK).json(updatedProduct);
  } catch (error) {
    console.error('Error updating product block status:', error);
    res.status(HttpStatus.BAD_REQUEST).json({ message: error.message });
  }
};

// Update variant block status
export const updateVariantBlockStatus = async (req, res) => {
  try {
    const { variantId } = req.params;
    const { isBlocked } = req.body;

    const updatedVariant = await Variant.findByIdAndUpdate(
      variantId,
      { isBlocked },
      { new: true }
    ).populate('product', 'name');

    if (!updatedVariant) {
      return res.status(HttpStatus.NOT_FOUND).json({ message: "Variant not found" });
    }

    res.status(HttpStatus.OK).json(updatedVariant);
  } catch (error) {
    console.error('Error updating variant block status:', error);
    res.status(HttpStatus.BAD_REQUEST).json({ message: error.message });
  }
};

// Add this new controller method
export const getAllBrandsWithoutPagination = async (req, res) => {
  try {
    // Only fetch listed brands
    const brands = await Brand.find({ status: 'listed' })
      .sort({ createdAt: -1 });

    res.json({
      brands
    });
  } catch (error) {
    console.error('Error fetching brands:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ 
      success: false,
      message: 'Error fetching brands',
      error: error.message 
    });
  }
};