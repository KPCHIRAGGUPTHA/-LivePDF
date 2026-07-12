import { useState } from 'react';

export default function SearchBar({ query, onChange, matchCount, currentIndex, onNext, onPrev }) {
  const [isFocused, setIsFocused] = useState(false);
  const [prevHover, setPrevHover] = useState(false);
  const [nextHover, setNextHover] = useState(false);

  return (
    <div className="responsive-search-wrap" style={styles.wrap}>
      <div className="responsive-search-input-wrapper" style={{
        ...styles.inputWrapper,
        borderColor: isFocused ? '#1a1a1a' : '#d0d0d0',
        boxShadow: isFocused ? '0 0 0 2px rgba(26, 26, 26, 0.1)' : 'none'
      }}>
        <span style={styles.searchIcon}>🔍</span>
        <input
          style={styles.input}
          type="text"
          placeholder="Search... (press /)"
          value={query}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          id="pdf-search-input"
        />
      </div>
      {query && (
        <div style={styles.resultsArea}>
          <span style={styles.count}>
            {matchCount > 0 ? `${currentIndex + 1} of ${matchCount}` : 'No results'}
          </span>
          <button
            style={{
              ...styles.navBtn,
              ...(prevHover && matchCount > 0 ? styles.navBtnHover : {}),
              opacity: matchCount === 0 ? 0.5 : 1
            }}
            onClick={onPrev}
            disabled={matchCount === 0}
            onMouseEnter={() => setPrevHover(true)}
            onMouseLeave={() => setPrevHover(false)}
          >
            ‹
          </button>
          <button
            style={{
              ...styles.navBtn,
              ...(nextHover && matchCount > 0 ? styles.navBtnHover : {}),
              opacity: matchCount === 0 ? 0.5 : 1
            }}
            onClick={onNext}
            disabled={matchCount === 0}
            onMouseEnter={() => setNextHover(true)}
            onMouseLeave={() => setNextHover(false)}
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  wrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: '#fcfcfc',
    padding: '2px 4px',
    borderRadius: 8,
  },
  inputWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    border: '0.5px solid #d0d0d0',
    borderRadius: 6,
    padding: '4px 8px',
    background: '#fff',
    transition: 'all 0.2s ease',
    width: 180,
  },
  searchIcon: {
    fontSize: 12,
    opacity: 0.5,
    userSelect: 'none',
  },
  input: {
    border: 'none',
    outline: 'none',
    fontSize: 13,
    width: '100%',
    color: '#1a1a1a',
  },
  resultsArea: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  count: {
    fontSize: 11,
    color: '#666',
    whiteSpace: 'nowrap',
    fontWeight: 500,
    background: '#f0f0ed',
    padding: '3px 6px',
    borderRadius: 4,
    marginRight: 2,
  },
  navBtn: {
    width: 24,
    height: 24,
    border: '0.5px solid #d0d0d0',
    borderRadius: 6,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s ease',
    color: '#444',
  },
  navBtnHover: {
    background: '#f9f9f7',
    borderColor: '#999',
    color: '#1a1a1a',
  },
};
