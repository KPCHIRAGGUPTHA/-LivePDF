package com.livepdf.ci;

/**
 * LivePDFCalculator - Utility class for PDF processing metrics, page budgeting, and validations.
 * Created as a Maven/JUnit CI assessment module for LivePDF.
 */
public class LivePDFCalculator {

    private static final long BYTES_PER_MB = 1024 * 1024;

    /**
     * Calculates total processing chunks required for a given total page count.
     *
     * @param totalPages Total number of pages in the PDF document
     * @param chunkSize Maximum number of pages per chunk
     * @return Number of chunks needed
     */
    public int calculateChunkCount(int totalPages, int chunkSize) {
        if (totalPages <= 0) {
            throw new IllegalArgumentException("Total pages must be greater than zero");
        }
        if (chunkSize <= 0) {
            throw new IllegalArgumentException("Chunk size must be greater than zero");
        }
        return (int) Math.ceil((double) totalPages / chunkSize);
    }

    /**
     * Estimates processing duration in seconds based on page count and OCR flag.
     *
     * @param pageCount Number of pages to process
     * @param ocrEnabled True if optical character recognition is enabled
     * @return Estimated duration in seconds (rounded to 2 decimal places)
     */
    public double estimateProcessingTimeSeconds(int pageCount, boolean ocrEnabled) {
        if (pageCount <= 0) {
            throw new IllegalArgumentException("Page count must be positive");
        }
        double baseTimePerPage = ocrEnabled ? 3.5 : 1.2;
        return Math.round((pageCount * baseTimePerPage) * 100.0) / 100.0;
    }

    /**
     * Validates whether a file size in bytes is within the allowed MB threshold.
     *
     * @param fileSizeBytes File size in bytes
     * @param maxAllowedMb Maximum allowed size in megabytes
     * @return true if valid, false otherwise
     */
    public boolean validateFileSize(long fileSizeBytes, int maxAllowedMb) {
        if (fileSizeBytes <= 0 || maxAllowedMb <= 0) {
            return false;
        }
        long maxBytes = (long) maxAllowedMb * BYTES_PER_MB;
        return fileSizeBytes <= maxBytes;
    }

    /**
     * Estimates AI token consumption based on text character count (~4 chars per token).
     *
     * @param characterCount Total characters extracted from PDF
     * @return Estimated token count
     */
    public int estimateTokenCount(int characterCount) {
        if (characterCount < 0) {
            throw new IllegalArgumentException("Character count cannot be negative");
        }
        if (characterCount == 0) {
            return 0;
        }
        return (int) Math.ceil((double) characterCount / 4.0);
    }
}
