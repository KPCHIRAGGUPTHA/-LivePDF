package com.livepdf.ci;

import org.junit.Before;
import org.junit.Test;
import static org.junit.Assert.*;

/**
 * JUnit test suite for LivePDFCalculator.
 * Assesses normal valid inputs, edge cases, and invalid inputs for Maven CI pipeline verification.
 */
public class LivePDFCalculatorTest {

    private LivePDFCalculator calculator;

    @Before
    public void setUp() {
        calculator = new LivePDFCalculator();
    }

    @Test
    public void testCalculateChunkCountValidInputs() {
        // Normal valid input 1: 10 pages with 3 pages per chunk => 4 chunks
        int chunks1 = calculator.calculateChunkCount(10, 3);
        assertEquals("10 pages with chunk size 3 should yield 4 chunks", 4, chunks1);

        // Normal valid input 2: 20 pages with 5 pages per chunk => 4 chunks
        int chunks2 = calculator.calculateChunkCount(20, 5);
        assertEquals("20 pages with chunk size 5 should yield 4 chunks", 4, chunks2);
    }

    @Test
    public void testCalculateChunkCountEdgeCase() {
        // Edge case: single page document
        int chunksSingle = calculator.calculateChunkCount(1, 10);
        assertEquals("1 page with chunk size 10 should yield 1 chunk", 1, chunksSingle);

        // Edge case: total pages equal chunk size
        int chunksExact = calculator.calculateChunkCount(5, 5);
        assertEquals("5 pages with chunk size 5 should yield 1 chunk", 1, chunksExact);
    }

    @Test(expected = IllegalArgumentException.class)
    public void testCalculateChunkCountInvalidZeroPages() {
        // Invalid input: zero total pages
        calculator.calculateChunkCount(0, 5);
    }

    @Test(expected = IllegalArgumentException.class)
    public void testCalculateChunkCountInvalidNegativeChunkSize() {
        // Invalid input: negative chunk size
        calculator.calculateChunkCount(10, -2);
    }

    @Test
    public void testEstimateProcessingTimeSeconds() {
        // Valid input without OCR (10 pages * 1.2s = 12.0s)
        double timeNoOcr = calculator.estimateProcessingTimeSeconds(10, false);
        assertEquals(12.0, timeNoOcr, 0.001);

        // Valid input with OCR (10 pages * 3.5s = 35.0s)
        double timeWithOcr = calculator.estimateProcessingTimeSeconds(10, true);
        assertEquals(35.0, timeWithOcr, 0.001);
    }

    @Test(expected = IllegalArgumentException.class)
    public void testEstimateProcessingTimeInvalidPageCount() {
        // Invalid input: negative page count
        calculator.estimateProcessingTimeSeconds(-5, false);
    }

    @Test
    public void testValidateFileSize() {
        long fiveMbInBytes = 5 * 1024 * 1024;
        long sixMbInBytes = 6 * 1024 * 1024;

        // Valid file size under max limit
        assertTrue("5MB should be valid under 10MB limit", calculator.validateFileSize(fiveMbInBytes, 10));

        // Invalid file size exceeding max limit
        assertFalse("6MB should be invalid under 5MB limit", calculator.validateFileSize(sixMbInBytes, 5));

        // Edge case: zero or negative bytes
        assertFalse("0 bytes should return false", calculator.validateFileSize(0, 10));
        assertFalse("Negative bytes should return false", calculator.validateFileSize(-100, 10));
    }

    @Test
    public void testEstimateTokenCount() {
        // Normal valid input: 100 characters => 25 tokens
        assertEquals(25, calculator.estimateTokenCount(100));

        // Edge case: 0 characters => 0 tokens
        assertEquals(0, calculator.estimateTokenCount(0));

        // Edge case: 5 characters => 2 tokens (rounded up)
        assertEquals(2, calculator.estimateTokenCount(5));
    }

    @Test(expected = IllegalArgumentException.class)
    public void testEstimateTokenCountNegative() {
        // Invalid input: negative character count
        calculator.estimateTokenCount(-10);
    }
}
