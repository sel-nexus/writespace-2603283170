/** Compose only the public discovery route and an explicit unknown-path fallback. */
import { Link, Route, Routes } from 'react-router-dom';
import { PublicNavbar } from './components/PublicNavbar.jsx';
import LandingPage from './pages/LandingPage.jsx';

/**
 * Render the discovery shell inside the single router supplied by main.
 * Returns:
 *   {JSX.Element} Public root and not-found route; later feature slices own all other routes.
 */
export default function App() {
  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <a
        href="#main-content"
        className="sr-only rounded bg-surface p-3 focus:not-sr-only focus:absolute focus:z-10 focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <PublicNavbar />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route
          path="*"
          element={(
            <main id="main-content" className="mx-auto max-w-6xl px-6 py-20 sm:px-8">
              <h1 className="font-display text-4xl">
                Page not found.
              </h1>
              <p className="mt-4 text-foreground-muted">
                This page does not exist.
              </p>
              <Link
                to="/"
                className="mt-8 inline-flex min-h-11 items-center rounded underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                Back to WriteSpace
              </Link>
            </main>
          )}
        />
      </Routes>
    </div>
  );
}
