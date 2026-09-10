/**
 * Footer.tsx — who made it, and where to find the rest.
 *
 * The year is written out rather than read from the clock, so the smoke test
 * that renders App does not start failing on New Year's Day.
 */

const PORTFOLIO_URL = "https://www.blakeganderson.com/";
const SOURCE_URL = "https://github.com/bganderson95/speakdown";

export function Footer() {
  return (
    <footer className="footer">
      <span>Blake Anderson, 2026</span>

      <nav className="footer-links" aria-label="Elsewhere">
        <a href={PORTFOLIO_URL} target="_blank" rel="noopener noreferrer">
          portfolio
        </a>
        <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
          source
        </a>
      </nav>
    </footer>
  );
}
