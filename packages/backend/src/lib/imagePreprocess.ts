/**
 * Image Preprocessing Utility for Insurance Card OCR
 *
 * Uses Sharp library for server-side image processing to optimize
 * images before sending to Claude for extraction.
 */
import type Sharp from 'sharp';
import logger from '../utils/logger';

async function getSharp(): Promise<typeof Sharp> {
  const mod = await import('sharp');
  return mod.default;
}

export interface PreprocessConfig {
  maxDimension?: number;
  quality?: number;
  autoRotate?: boolean;
  enhanceContrast?: boolean;
  grayscale?: boolean;
}

export interface PreprocessResult {
  base64: string;
  mediaType: 'image/jpeg';
  originalSize: number;
  processedSize: number;
  compressionRatio: number;
  originalDimensions: { width: number; height: number };
  processedDimensions: { width: number; height: number };
  processingApplied: {
    resized: boolean;
    rotated: boolean;
    contrastEnhanced: boolean;
    convertedToGrayscale: boolean;
  };
}

const DEFAULT_CONFIG: Required<PreprocessConfig> = {
  maxDimension: 1024,
  quality: 80,
  autoRotate: true,
  enhanceContrast: false,
  grayscale: false,
};

function decodeBase64ToBuffer(base64Data: string): Buffer {
  const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
  return Buffer.from(cleanBase64, 'base64');
}

export async function preprocessImage(
  base64Image: string,
  config: PreprocessConfig = {}
): Promise<PreprocessResult> {
  const opts = { ...DEFAULT_CONFIG, ...config };

  const inputBuffer = decodeBase64ToBuffer(base64Image);
  const originalSize = inputBuffer.length;

  const sharp = await getSharp();
  const metadata = await sharp(inputBuffer).metadata();
  const originalWidth = metadata.width || 0;
  const originalHeight = metadata.height || 0;

  let pipeline = sharp(inputBuffer);

  const processingApplied = {
    resized: false,
    rotated: false,
    contrastEnhanced: false,
    convertedToGrayscale: false,
  };

  if (opts.autoRotate) {
    pipeline = pipeline.rotate();
    if (metadata.orientation && metadata.orientation > 1) {
      processingApplied.rotated = true;
    }
  }

  if (originalWidth > opts.maxDimension || originalHeight > opts.maxDimension) {
    pipeline = pipeline.resize(opts.maxDimension, opts.maxDimension, {
      fit: 'inside',
      withoutEnlargement: true,
    });
    processingApplied.resized = true;
  }

  if (opts.enhanceContrast) {
    pipeline = pipeline.normalize().linear(1.1, -10);
    processingApplied.contrastEnhanced = true;
  }

  if (opts.grayscale) {
    pipeline = pipeline.grayscale();
    processingApplied.convertedToGrayscale = true;
  }

  pipeline = pipeline.jpeg({
    quality: opts.quality,
    mozjpeg: true,
  });

  const outputBuffer = await pipeline.toBuffer();
  const outputMetadata = await sharp(outputBuffer).metadata();

  const base64Output = outputBuffer.toString('base64');

  const processedSize = outputBuffer.length;
  const compressionRatio = originalSize / processedSize;

  logger.info({
    originalSize: `${(originalSize / 1024).toFixed(1)}KB`,
    processedSize: `${(processedSize / 1024).toFixed(1)}KB`,
    compressionRatio: `${compressionRatio.toFixed(2)}x`,
    originalDimensions: `${originalWidth}x${originalHeight}`,
    processedDimensions: `${outputMetadata.width}x${outputMetadata.height}`,
    processingApplied,
  }, 'Image preprocessed');

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

export async function preprocessImageEnhanced(
  base64Image: string
): Promise<PreprocessResult> {
  return preprocessImage(base64Image, {
    maxDimension: 1536,
    quality: 90,
    autoRotate: true,
    enhanceContrast: true,
    grayscale: false,
  });
}

export async function shouldEnhanceImage(base64Image: string): Promise<boolean> {
  const inputBuffer = decodeBase64ToBuffer(base64Image);
  const sharp = await getSharp();
  const metadata = await sharp(inputBuffer).metadata();

  const stats = await sharp(inputBuffer).stats();

  const channels = stats.channels;
  if (channels.length > 0) {
    const avgStdDev = channels.reduce((sum, ch) => sum + ch.stdev, 0) / channels.length;
    if (avgStdDev < 40) {
      return true;
    }
  }

  if ((metadata.width || 0) < 400 || (metadata.height || 0) < 300) {
    return true;
  }

  return false;
}
