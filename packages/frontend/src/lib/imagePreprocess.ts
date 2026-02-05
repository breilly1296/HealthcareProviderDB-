/**
 * Image Preprocessing Utility for Insurance Card OCR
 *
 * Uses Sharp library for server-side image processing to optimize
 * images before sending to Claude for extraction.
 */
import type Sharp from 'sharp';

async function getSharp(): Promise<typeof Sharp> {
  const mod = await import('sharp');
  return mod.default;
}

/**
 * Configuration for image preprocessing
 */
export interface PreprocessConfig {
  /** Maximum dimension (width or height) in pixels. Default: 1024 */
  maxDimension?: number;
  /** JPEG quality (1-100). Default: 80 */
  quality?: number;
  /** Whether to auto-rotate based on EXIF. Default: true */
  autoRotate?: boolean;
  /** Whether to enhance contrast for low-quality images. Default: false */
  enhanceContrast?: boolean;
  /** Whether to convert to grayscale for better OCR. Default: false */
  grayscale?: boolean;
}

/**
 * Result of image preprocessing
 */
export interface PreprocessResult {
  /** Processed image as base64 string */
  base64: string;
  /** Media type of the processed image */
  mediaType: 'image/jpeg';
  /** Original image size in bytes */
  originalSize: number;
  /** Processed image size in bytes */
  processedSize: number;
  /** Compression ratio (original / processed) */
  compressionRatio: number;
  /** Original image dimensions */
  originalDimensions: { width: number; height: number };
  /** Processed image dimensions */
  processedDimensions: { width: number; height: number };
  /** Processing metadata for monitoring */
  processingApplied: {
    resized: boolean;
    rotated: boolean;
    contrastEnhanced: boolean;
    convertedToGrayscale: boolean;
  };
}

/**
 * Default preprocessing configuration
 */
const DEFAULT_CONFIG: Required<PreprocessConfig> = {
  maxDimension: 1024,
  quality: 80,
  autoRotate: true,
  enhanceContrast: false,
  grayscale: false,
};

/**
 * Decode base64 image data to Buffer
 */
function decodeBase64ToBuffer(base64Data: string): Buffer {
  // Remove data URL prefix if present
  const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
  return Buffer.from(cleanBase64, 'base64');
}

/**
 * Preprocess an image for optimal OCR extraction
 *
 * @param base64Image - Base64 encoded image (with or without data URL prefix)
 * @param config - Preprocessing configuration options
 * @returns Processed image data and metadata
 *
 * @example
 * ```typescript
 * const result = await preprocessImage(imageBase64, {
 *   maxDimension: 1024,
 *   quality: 80,
 *   enhanceContrast: true
 * });
 * console.log(`Compressed from ${result.originalSize} to ${result.processedSize} bytes`);
 * ```
 */
export async function preprocessImage(
  base64Image: string,
  config: PreprocessConfig = {}
): Promise<PreprocessResult> {
  const opts = { ...DEFAULT_CONFIG, ...config };

  // Decode base64 to buffer
  const inputBuffer = decodeBase64ToBuffer(base64Image);
  const originalSize = inputBuffer.length;

  // Get original image metadata
  const sharp = await getSharp();
  const metadata = await sharp(inputBuffer).metadata();
  const originalWidth = metadata.width || 0;
  const originalHeight = metadata.height || 0;

  // Build the Sharp pipeline
  let pipeline = sharp(inputBuffer);

  // Track what processing was applied
  const processingApplied = {
    resized: false,
    rotated: false,
    contrastEnhanced: false,
    convertedToGrayscale: false,
  };

  // Auto-rotate based on EXIF orientation
  if (opts.autoRotate) {
    pipeline = pipeline.rotate(); // Sharp auto-rotates when called without arguments
    // Check if image was rotated by comparing to EXIF orientation
    if (metadata.orientation && metadata.orientation > 1) {
      processingApplied.rotated = true;
    }
  }

  // Resize if larger than maxDimension (maintain aspect ratio)
  if (originalWidth > opts.maxDimension || originalHeight > opts.maxDimension) {
    pipeline = pipeline.resize(opts.maxDimension, opts.maxDimension, {
      fit: 'inside', // Maintain aspect ratio, fit within box
      withoutEnlargement: true, // Don't upscale smaller images
    });
    processingApplied.resized = true;
  }

  // Enhance contrast for low-quality images
  if (opts.enhanceContrast) {
    // Normalize stretches histogram to use full range
    // Linear applies a simple contrast/brightness adjustment
    pipeline = pipeline.normalize().linear(1.1, -10);
    processingApplied.contrastEnhanced = true;
  }

  // Convert to grayscale (can improve OCR for some images)
  if (opts.grayscale) {
    pipeline = pipeline.grayscale();
    processingApplied.convertedToGrayscale = true;
  }

  // Convert to JPEG with specified quality
  pipeline = pipeline.jpeg({
    quality: opts.quality,
    mozjpeg: true, // Use mozjpeg for better compression
  });

  // Process the image
  const outputBuffer = await pipeline.toBuffer();
  const outputMetadata = await sharp(outputBuffer).metadata();

  // Convert to base64
  const base64Output = outputBuffer.toString('base64');

  const processedSize = outputBuffer.length;
  const compressionRatio = originalSize / processedSize;

  // Log for monitoring
  console.log('[ImagePreprocess]', {
    originalSize: `${(originalSize / 1024).toFixed(1)}KB`,
    processedSize: `${(processedSize / 1024).toFixed(1)}KB`,
    compressionRatio: `${compressionRatio.toFixed(2)}x`,
    originalDimensions: `${originalWidth}x${originalHeight}`,
    processedDimensions: `${outputMetadata.width}x${outputMetadata.height}`,
    processingApplied,
  });

  return {
    base64: base64Output,
    mediaType: 'image/jpeg',
    originalSize,
    processedSize,
    compressionRatio,
    originalDimensions: { width: originalWidth, height: originalHeight },
    processedDimensions: {
      width: outputMetadata.width || 0,
      height: outputMetadata.height || 0,
    },
    processingApplied,
  };
}

/**
 * Preprocess an image with enhanced settings for difficult cards
 * (low contrast, blurry, or small text)
 */
export async function preprocessImageEnhanced(
  base64Image: string
): Promise<PreprocessResult> {
  return preprocessImage(base64Image, {
    maxDimension: 1536, // Higher resolution for small text
    quality: 90, // Higher quality for detail preservation
    autoRotate: true,
    enhanceContrast: true,
    grayscale: false, // Keep color - some cards use color for organization
  });
}

/**
 * Check if an image likely needs enhancement based on basic metrics
 */
export async function shouldEnhanceImage(base64Image: string): Promise<boolean> {
  const inputBuffer = decodeBase64ToBuffer(base64Image);
  const sharp = await getSharp();
  const metadata = await sharp(inputBuffer).metadata();

  // Get image stats
  const stats = await sharp(inputBuffer).stats();

  // Check for low contrast (small difference between channels)
  const channels = stats.channels;
  if (channels.length > 0) {
    const avgStdDev = channels.reduce((sum, ch) => sum + ch.stdev, 0) / channels.length;
    // Low standard deviation suggests low contrast
    if (avgStdDev < 40) {
      return true;
    }
  }

  // Check if image is very small (might need higher quality processing)
  if ((metadata.width || 0) < 400 || (metadata.height || 0) < 300) {
    return true;
  }

  return false;
}
