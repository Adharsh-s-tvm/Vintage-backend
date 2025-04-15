import { HttpStatus } from "../utils/httpStatus.js";

const asyncHandler = (fn) => (req, res, next) => {
    return Promise.resolve(fn(req, res, next)).catch((error) => {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    });
};

export default asyncHandler;