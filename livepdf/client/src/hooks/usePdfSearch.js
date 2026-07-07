import { useState, useEffect } from 'react';

export default function usePdfSearch(pdfDoc) {
  const [searchQuery, setSearchQuery] = useState('');
  const [matches, setMatches] = useState([]); // Array of { pageNumber, itemIndex, text, x, y, w, h }
  const [currentMatch, setCurrentMatch] = useState(0);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!pdfDoc || !searchQuery.trim()) {
      setMatches([]);
      setCurrentMatch(0);
      return;
    }

    let isCancelled = false;

    async function performSearch() {
      setIsSearching(true);
      const allMatches = [];
      const query = searchQuery.toLowerCase().trim();

      try {
        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
          if (isCancelled) return;
          const page = await pdfDoc.getPage(pageNum);
          const textContent = await page.getTextContent();
          const viewport = page.getViewport({ scale: 1.0 });

          textContent.items.forEach((item, itemIndex) => {
            if (item.str && item.str.toLowerCase().includes(query)) {
              // PDF.js transform: [scaleX, skewY, skewX, scaleY, transformX, transformY]
              // X and Y are transform[4] and transform[5]
              const rect = [
                item.transform[4],
                item.transform[5],
                item.transform[4] + item.width,
                item.transform[5] + item.height
              ];
              const [left, top, right, bottom] = viewport.convertToViewportRectangle(rect);

              allMatches.push({
                pageNumber: pageNum,
                itemIndex,
                text: item.str,
                x: Math.min(left, right),
                y: Math.min(top, bottom),
                w: Math.max(1, Math.abs(right - left)), // Ensure width is at least 1px
                h: Math.max(1, Math.abs(bottom - top)), // Ensure height is at least 1px
              });
            }
          });
        }

        if (!isCancelled) {
          setMatches(allMatches);
          setCurrentMatch(0);
        }
      } catch (err) {
        console.error('Error searching PDF text content:', err);
      } finally {
        if (!isCancelled) {
          setIsSearching(false);
        }
      }
    }

    // Debounce search by 300ms to avoid freezing on continuous typing
    const timer = setTimeout(() => {
      performSearch();
    }, 300);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [pdfDoc, searchQuery]);

  function goToNextMatch() {
    if (matches.length === 0) return;
    setCurrentMatch(i => (i + 1) % matches.length);
  }

  function goToPrevMatch() {
    if (matches.length === 0) return;
    setCurrentMatch(i => (i - 1 + matches.length) % matches.length);
  }

  return {
    searchQuery,
    setSearchQuery,
    matches,
    currentMatch,
    setCurrentMatch,
    goToNextMatch,
    goToPrevMatch,
    isSearching,
  };
}
