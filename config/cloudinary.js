import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } from "./env.js";

// Configure Cloudinary v2
cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true, // always serve images over HTTPS
});

// Multer — store files in memory so we can stream to Cloudinary
// We do NOT write to disk; the buffer is passed directly to cloudinary.uploader.upload_stream
const storage = multer.memoryStorage();

export const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB per file
    fileFilter: (_req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/jpg"];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only JPEG, PNG, JPG, WebP and GIF images are allowed."));
        }
    },
});

// Helper: upload a buffer to Cloudinary and return the secure URL
// folder: the Cloudinary folder to organise assets (e.g. "castra/products")
export function uploadToCloudinary(buffer, folder = "castra/products") {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder,
                resource_type: "image",
                transformation: [
                    { quality: "auto:good" },  // auto-optimise quality
                    { fetch_format: "auto" },   // serve WebP/AVIF to supported browsers
                ],
            },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );
        stream.end(buffer);
    });
}

// Helper: delete an image from Cloudinary by its public_id
export function deleteFromCloudinary(publicId) {
    return cloudinary.uploader.destroy(publicId, { resource_type: "image" });
}

export default cloudinary;
