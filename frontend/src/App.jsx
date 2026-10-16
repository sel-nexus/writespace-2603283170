/** Compose public identity and discovery with guarded reading and authoring; administration belongs to a later slice. */
import { useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { PublicNavbar } from './components/PublicNavbar.jsx';
import { Navbar } from './components/Navbar.jsx';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import Home from './pages/Home.jsx';
import ReadBlog from './pages/ReadBlog.jsx';
import WriteBlog from './pages/WriteBlog.jsx';
import LandingPage from './pages/LandingPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import { getSession } from './utils/auth.js';

/**
 * Render the public or authenticated shell inside the single router supplied by main.
 * Returns:
 *   {JSX.Element} Public root, identity forms, protected reading pages, and the unchanged unknown-route fallback.
 */
export default function App() {
  const [session, setSession] = useState(() => getSession());
  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <a
        href="#main-content"
        className="sr-only rounded bg-surface p-3 focus:not-sr-only focus:absolute focus:z-10 focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      {session ? (
        <Navbar session={session} onSessionChange={setSession} />
      ) : (
        <PublicNavbar />
      )}
      <Routes>
        <Route path="/" element={<LandingPage session={session} />} />
        <Route path="/login" element={<LoginPage onSessionChange={setSession} />} />
        <Route path="/register" element={<RegisterPage onSessionChange={setSession} />} />
        <Route
          path="/blogs"
          element={(
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/blog/:id"
          element={(
            <ProtectedRoute>
              <ReadBlog />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/write"
          element={(
            <ProtectedRoute>
              <WriteBlog />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/edit/:id"
          element={(
            <ProtectedRoute>
              <WriteBlog />
            </ProtectedRoute>
          )}
        />
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
