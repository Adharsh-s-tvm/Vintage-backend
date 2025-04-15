import { HttpStatus } from "../utils/httpStatus.js";

export const errorHandler = (err,req, res, next) => {
    console.log(err.stack);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Internal Server Error"
    })
    
}