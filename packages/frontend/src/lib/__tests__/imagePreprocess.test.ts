/**
 * Tests for image preprocessing utility
 *
 * Note: These tests mock the Sharp library since it's a native module
 * that requires binary dependencies. Integration tests should be run
 * separately with actual images.
 */

// Mock sharp before importing the module
const mockSharpInstance = {
  metadata: jest.fn(),
  rotate: jest.fn().mockReturnThis(),
  resize: jest.fn().mockReturnThis(),
  normalize: jest.fn().mockReturnThis(),
  linear: jest.fn().mockReturnThis(),
  grayscale: jest.fn().mockReturnThis(),
  jpeg: jest.fn().mockReturnThis(),
  toBuffer: jest.fn(),
  stats: jest.fn(),
};

jest.mock('sharp', () => {
  return jest.fn(() => mockSharpInstance);
});

import { preprocessImage, preprocessImageEnhanced, shouldEnhanceImage, PreprocessConfig } from '../imagePreprocess';

describe('imagePreprocess', () => {
  // Sample base64 encoded 1x1 red pixel JPEG
  const sampleBase64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof';

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    mockSharpInstance.metadata.mockResolvedValue({
      width: 800,
      height: 600,
      orientation: 1,
    });

    mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from('processed-image'));

    mockSharpInstance.stats.mockResolvedValue({
      channels: [
        { stdev: 50 },
        { stdev: 50 },
        { stdev: 50 },
      ],
    });
  });

  describe('preprocessImage', () => {
    it('should process an image with default settings', async () => {
      const result = await preprocessImage(sampleBase64);

      expect(result).toBeDefined();
      expect(result.base64).toBeDefined();
      expect(result.mediaType).toBe('image/jpeg');
      expect(result.originalSize).toBeGreaterThan(0);
      expect(result.processedSize).toBeGreaterThan(0);
    });

    it('should auto-rotate images by default', async () => {
      await preprocessImage(sampleBase64);

      expect(mockSharpInstance.rotate).toHaveBeenCalled();
    });

    it('should resize large images', async () => {
      mockSharpInstance.metadata.mockResolvedValue({
        width: 2000,
        height: 1500,
        orientation: 1,
      });

      const result = await preprocessImage(sampleBase64, { maxDimension: 1024 });

      expect(mockSharpInstance.resize).toHaveBeenCalledWith(1024, 1024, {
        fit: 'inside',
        withoutEnlargement: true,
      });
      expect(result.processingApplied.resized).toBe(true);
    });

    it('should not resize images smaller than maxDimension', async () => {
      mockSharpInstance.metadata.mockResolvedValue({
        width: 800,
        height: 600,
        orientation: 1,
      });

      const result = await preprocessImage(sampleBase64, { maxDimension: 1024 });

      expect(mockSharpInstance.resize).not.toHaveBeenCalled();
      expect(result.processingApplied.resized).toBe(false);
    });

    it('should enhance contrast when requested', async () => {
      const result = await preprocessImage(sampleBase64, { enhanceContrast: true });

      expect(mockSharpInstance.normalize).toHaveBeenCalled();
      expect(mockSharpInstance.linear).toHaveBeenCalled();
      expect(result.processingApplied.contrastEnhanced).toBe(true);
    });

    it('should convert to grayscale when requested', async () => {
      const result = await preprocessImage(sampleBase64, { grayscale: true });

      expect(mockSharpInstance.grayscale).toHaveBeenCalled();
      expect(result.processingApplied.convertedToGrayscale).toBe(true);
    });

    it('should use specified quality setting', async () => {
      await preprocessImage(sampleBase64, { quality: 90 });

      expect(mockSharpInstance.jpeg).toHaveBeenCalledWith({
        quality: 90,
        mozjpeg: true,
      });
    });

    it('should handle data URL prefix', async () => {
      const dataUrl = `data:image/jpeg;base64,${sampleBase64}`;

      const result = await preprocessImage(dataUrl);

      expect(result).toBeDefined();
      expect(result.base64).toBeDefined();
    });

    it('should track rotated flag when EXIF orientation exists', async () => {
      mockSharpInstance.metadata.mockResolvedValue({
        width: 800,
        height: 600,
        orientation: 6, // Rotated 90 degrees
      });

      const result = await preprocessImage(sampleBase64);

      expect(result.processingApplied.rotated).toBe(true);
    });

    it('should calculate compression ratio', async () => {
      mockSharpInstance.toBuffer.mockResolvedValue(Buffer.alloc(5000)); // 5KB processed

      const result = await preprocessImage(sampleBase64);

      expect(result.compressionRatio).toBeGreaterThan(0);
    });

    it('should return original and processed dimensions', async () => {
      mockSharpInstance.metadata
        .mockResolvedValueOnce({ width: 2000, height: 1500, orientation: 1 })
        .mockResolvedValueOnce({ width: 1024, height: 768 });

      const result = await preprocessImage(sampleBase64, { maxDimension: 1024 });

      expect(result.originalDimensions).toEqual({ width: 2000, height: 1500 });
      expect(result.processedDimensions).toBeDefined();
    });
  });

  describe('preprocessImageEnhanced', () => {
    it('should use enhanced settings', async () => {
      await preprocessImageEnhanced(sampleBase64);

      // Should enhance contrast
      expect(mockSharpInstance.normalize).toHaveBeenCalled();
      expect(mockSharpInstance.linear).toHaveBeenCalled();

      // Should use higher quality
      expect(mockSharpInstance.jpeg).toHaveBeenCalledWith({
        quality: 90,
        mozjpeg: true,
      });
    });
  });

  describe('shouldEnhanceImage', () => {
    it('should return true for low contrast images', async () => {
      mockSharpInstance.stats.mockResolvedValue({
        channels: [
          { stdev: 20 },
          { stdev: 20 },
          { stdev: 20 },
        ],
      });

      mockSharpInstance.metadata.mockResolvedValue({
        width: 800,
        height: 600,
      });

      const result = await shouldEnhanceImage(sampleBase64);

      expect(result).toBe(true);
    });

    it('should return true for small images', async () => {
      mockSharpInstance.stats.mockResolvedValue({
        channels: [
          { stdev: 60 },
          { stdev: 60 },
          { stdev: 60 },
        ],
      });

      mockSharpInstance.metadata.mockResolvedValue({
        width: 300,
        height: 200,
      });

      const result = await shouldEnhanceImage(sampleBase64);

      expect(result).toBe(true);
    });

    it('should return false for good quality images', async () => {
      mockSharpInstance.stats.mockResolvedValue({
        channels: [
          { stdev: 60 },
          { stdev: 60 },
          { stdev: 60 },
        ],
      });

      mockSharpInstance.metadata.mockResolvedValue({
        width: 1000,
        height: 800,
      });

      const result = await shouldEnhanceImage(sampleBase64);

      expect(result).toBe(false);
    });
  });

  describe('PreprocessConfig', () => {
    it('should apply all config options', async () => {
      const config: PreprocessConfig = {
        maxDimension: 512,
        quality: 70,
        autoRotate: true,
        enhanceContrast: true,
        grayscale: true,
      };

      mockSharpInstance.metadata.mockResolvedValue({
        width: 1000,
        height: 800,
        orientation: 1,
      });

      const result = await preprocessImage(sampleBase64, config);

      expect(mockSharpInstance.resize).toHaveBeenCalledWith(512, 512, expect.any(Object));
      expect(mockSharpInstance.jpeg).toHaveBeenCalledWith({ quality: 70, mozjpeg: true });
      expect(mockSharpInstance.normalize).toHaveBeenCalled();
      expect(mockSharpInstance.grayscale).toHaveBeenCalled();
      expect(result.processingApplied.resized).toBe(true);
      expect(result.processingApplied.contrastEnhanced).toBe(true);
      expect(result.processingApplied.convertedToGrayscale).toBe(true);
    });
  });
});
