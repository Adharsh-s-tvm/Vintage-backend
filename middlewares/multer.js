import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import cloudinary from '../config/cloudinary.js';
import { HttpStatus } from '../utils/httpStatus.js';


// Add error handling for cloudinary configuration
console.log("Initializing Cloudinary storage...")




const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: (req, file) => {
            // Check the route to determine the folder
            if (file.fieldname === 'image') {
                return 'profile_images';
            }
            return 'jackets'; // your default folder for products
        },
        allowed_formats: ['jpg', 'png', 'jpeg', 'avif', 'webp'],
    },
});


//lllllll
cloudinary.config().cloud_name ?
    console.log("Cloudinary configured successfully") :
    console.log("Cloudinary configuration missing");


const upload = multer({ storage });

// export default upload;

const uploadFields = upload.fields([
    { name: 'mainImage', maxCount: 1 },
    { name: 'subImages', maxCount: 5 }
]);

const handleUpload = (req, res, next) => {
    console.log("Starting file upload...");
    console.log("Request body:", req.body);
    console.log("Request files:", req.files);

    uploadFields(req, res, (err) => {
        if (err) {
            console.error("Upload error:", err);
            return res.status(HttpStatus.BAD_REQUEST).json({
                success: false,
                message: "File upload error",
                error: err.message
            });
        }

        
        // For variant updates, don't require files
        if (req.method === 'PUT' && req.path.includes('/variant/')) {
            return next();
        }

        // For other routes (like adding new variants), require files
        if (!req.files || Object.keys(req.files).length === 0) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                success: false,
                message: "No files were uploaded"
            });
        }

        // Log successful upload
        console.log("Files uploaded successfully:", req.files);
        next();
    });
};

export { handleUpload, upload };