/** Verify discovery copy, local preview integrity, explicit navigation, and the initial App routes. */
import { StrictMode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import App from '../App.jsx';
import * as storage from '../utils/storage.js';
import LandingPage from './LandingPage.jsx';

/** Build a complete deterministic local preview record. */
function post(index, overrides = {}) {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    title: `Story ${index}`,
    content: `Words for story ${index}`,
    createdAt: `2026-03-0${index}T12:00:00.000Z`,
    authorId: 'admin',
    authorName: 'Admin',
    ...overrides,
  };
}

/** Expose navigation state for meaningful activation assertions. */
function Location() {
  const location = useLocation();
  return (
    <output aria-label="Current route">
      {location.pathname}
    </output>
  );
}

/** Render the page as the root route with destination observation, not production stub pages. */
function renderLanding(session = null) {
  return render(
    <StrictMode>
      <MemoryRouter>
        <Location />
        <Routes>
          <Route path="/" element={<LandingPage session={session} />} />
          <Route path="*" element={null} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );
}

/** Find the named preview section by its accessible heading. */
function previews() {
  return screen.getByRole('region', { name: 'Latest from the Blog' });
}

describe('LandingPage', () => {
  it('renders the hero, exact tagline, guest CTAs, and footer', () => {
    renderLanding();
    expect(screen.getByRole('heading', { level: 1, name: 'WriteSpace' })).toBeInTheDocument();
    expect(screen.getByText('Your thoughts. Your space. Beautifully simple.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Get Started Free' })).toHaveAttribute('href', '/register');
    expect(screen.getByRole('link', { name: 'Start Reading' })).toHaveAttribute('href', '/login');
    expect(within(screen.getByRole('contentinfo')).getByText(/© .* WriteSpace/)).toBeInTheDocument();
  });

  it('renders exactly three named feature cards with their local plain-text no-server meaning', () => {
    renderLanding();
    const features = screen.getByRole('region', { name: 'Room for what matters' });
    expect(within(features).getAllByRole('article')).toHaveLength(3);
    expect(within(features).getByRole('heading', { name: 'Write Freely' })).toBeInTheDocument();
    expect(within(features).getByRole('heading', { name: 'Private & Local' })).toBeInTheDocument();
    expect(within(features).getByRole('heading', { name: 'Instant & Fast' })).toBeInTheDocument();
    expect(within(features).getByText(/Plain-text, distraction-free/)).toBeInTheDocument();
    expect(within(features).getByText(/browser profile, not on a shared server/)).toBeInTheDocument();
    expect(within(features).getByText(/no-server experience/)).toBeInTheDocument();
    expect(features.querySelector('div')).toHaveClass('grid', 'sm:grid-cols-3');
  });

  it('discloses plaintext, client-controlled identity, no real passwords, and data-loss limits publicly', () => {
    renderLanding();
    const notice = screen.getByRole('complementary', { name: 'A local demo, not production security' });
    expect(within(notice).getByText(/client-side only.*anyone controlling this browser/)).toBeInTheDocument();
    expect(within(notice).getByText(/plaintext in localStorage.*Do not use real passwords/)).toBeInTheDocument();
    expect(within(notice).getByText(/only in this browser profile.*no cloud backup or cross-device sync/)).toBeInTheDocument();
    expect(within(notice).getByText(/clearing browser storage removes your data/)).toBeInTheDocument();
  });

  it('shows the exact empty state when no posts exist', () => {
    renderLanding();
    expect(within(previews()).getByText('No posts yet — check back soon!')).toBeInTheDocument();
    expect(within(previews()).queryAllByRole('article')).toHaveLength(0);
  });

  it.each([1, 2, 3])('renders all %s available posts without adding placeholders', count => {
    localStorage.setItem('writespace_posts', JSON.stringify(Array.from({ length: count }, (_, index) => post(index + 1))));
    renderLanding();
    expect(within(previews()).getAllByRole('article')).toHaveLength(count);
    expect(screen.queryByText('No posts yet — check back soon!')).not.toBeInTheDocument();
  });

  it('renders only three newest posts in descending order without changing persistence', () => {
    const records = [post(2), post(4), post(1), post(3)];
    const original = JSON.stringify(records);
    localStorage.setItem('writespace_posts', original);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    renderLanding();
    const titles = within(previews()).getAllByRole('heading').filter(heading => heading.tagName === 'H3');
    expect(titles.map(heading => heading.textContent)).toEqual(['Story 4', 'Story 3', 'Story 2']);
    expect(screen.queryByRole('link', { name: 'Story 1' })).not.toBeInTheDocument();
    expect(localStorage.getItem('writespace_posts')).toBe(original);
    expect(write).not.toHaveBeenCalled();
  });

  it('preserves input order for equal timestamps without sorting the source array in place', () => {
    const records = [post(3), post(1), post(2)].map(record => ({ ...record, createdAt: '2026-03-04T12:00:00Z' }));
    vi.spyOn(storage, 'getPosts').mockReturnValue(records);
    renderLanding();
    expect(within(previews()).getAllByRole('link').map(link => link.textContent)).toEqual(['Story 3', 'Story 1', 'Story 2']);
    expect(records.map(record => record.title)).toEqual(['Story 3', 'Story 1', 'Story 2']);
  });

  it.each([119, 120, 121])('uses the first 120 JavaScript characters at content length %s without a synthetic ellipsis', length => {
    const content = 'x'.repeat(length);
    localStorage.setItem('writespace_posts', JSON.stringify([post(1, { content })]));
    renderLanding();
    const article = within(previews()).getByRole('article');
    expect(article.querySelector('p').textContent).toBe(content.slice(0, 120));
  });

  it('shows a two-digit English date with machine-readable ISO time', () => {
    localStorage.setItem('writespace_posts', JSON.stringify([post(1)]));
    renderLanding();
    const date = within(previews()).getByText('Mar 01, 2026');
    expect(date.tagName).toBe('TIME');
    expect(date).toHaveAttribute('datetime', '2026-03-01T12:00:00.000Z');
  });

  it('keeps preview content as plain text and preserves whitespace rather than injecting HTML', () => {
    const content = '  <img src=x onerror=alert(1)>\n\n  Next line';
    localStorage.setItem('writespace_posts', JSON.stringify([post(1, { title: '<b>Local title</b>', content })]));
    renderLanding();
    const article = within(previews()).getByRole('article');
    expect(within(article).getByRole('link', { name: '<b>Local title</b>' })).toBeInTheDocument();
    expect(article.querySelector('img')).toBeNull();
    expect(article.querySelector('b')).toBeNull();
    expect(article.querySelector('p').textContent).toBe(content);
    expect(article.querySelector('p')).toHaveClass('whitespace-pre-wrap', 'break-words');
  });

  it('exposes one/two/three-column previews and wrap-safe cards through existing Tailwind utilities', () => {
    localStorage.setItem('writespace_posts', JSON.stringify([post(1)]));
    renderLanding();
    const article = within(previews()).getByRole('article');
    expect(article.parentElement).toHaveClass('grid', 'md:grid-cols-2', 'lg:grid-cols-3');
    expect(article).toHaveClass('min-w-0');
  });

  it.each(['{broken', '{}', JSON.stringify([post(1), post(2, { createdAt: '2026-02-30' })])])
  ('shows the empty state for corrupted posts without repairing %s', raw => {
    localStorage.setItem('writespace_posts', raw);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    renderLanding();
    expect(within(previews()).getByText('No posts yet — check back soon!')).toBeInTheDocument();
    expect(localStorage.getItem('writespace_posts')).toBe(raw);
    expect(write).not.toHaveBeenCalled();
  });

  it('still previews valid posts when the independent users key is corrupted', () => {
    localStorage.setItem('writespace_posts', JSON.stringify([post(1)]));
    localStorage.setItem('writespace_users', '{broken-users');
    renderLanding();
    expect(within(previews()).getByRole('link', { name: 'Story 1' })).toBeInTheDocument();
    expect(localStorage.getItem('writespace_users')).toBe('{broken-users');
  });

  it.each(['getter', 'getItem'])('renders safely with a failed storage %s and keeps public CTAs usable', failure => {
    if (failure === 'getter') {
      vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    } else {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('read denied'); });
    }
    renderLanding();
    expect(within(previews()).getByText('No posts yet — check back soon!')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Get Started Free' })).toHaveAttribute('href', '/register');
  });

  it('keeps a page-local snapshot until remount, without background writes', () => {
    localStorage.setItem('writespace_posts', JSON.stringify([post(1)]));
    const view = renderLanding();
    localStorage.setItem('writespace_posts', JSON.stringify([post(2)]));
    expect(within(previews()).getByRole('link', { name: 'Story 1' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Story 2' })).not.toBeInTheDocument();
    view.unmount();
    renderLanding();
    expect(within(previews()).getByRole('link', { name: 'Story 2' })).toBeInTheDocument();
  });

  it('handles defensive invalid dates last with a readable fallback and stable invalid ties', () => {
    vi.spyOn(storage, 'getPosts').mockReturnValue([
      post(1, { createdAt: 'invalid' }), post(2), post(3, { createdAt: 'also invalid' }),
    ]);
    renderLanding();
    expect(within(previews()).getAllByRole('link').map(link => link.textContent)).toEqual(['Story 2', 'Story 1', 'Story 3']);
    expect(within(previews()).getAllByText('Date unavailable')).toHaveLength(2);
  });

  it.each([['Get Started Free', '/register'], ['Start Reading', '/login'], ['Story 1', '/login']])
  ('navigates a guest via %s only on activation', async (name, destination) => {
    const user = userEvent.setup();
    localStorage.setItem('writespace_posts', JSON.stringify([post(1)]));
    const write = vi.spyOn(Storage.prototype, 'setItem');
    renderLanding();
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/$/);
    await user.hover(screen.getByRole('link', { name }));
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/$/);
    await user.click(screen.getByRole('link', { name }));
    expect(screen.getByLabelText('Current route')).toHaveTextContent(destination);
    expect(write).not.toHaveBeenCalled();
  });

  it.each([['user', 'Go to My Space', '/blogs'], ['admin', 'Go to Dashboard', '/admin']])
  ('offers the future %s role CTA and authenticated post destination', async (role, label, destination) => {
    const user = userEvent.setup();
    const record = post(1);
    localStorage.setItem('writespace_posts', JSON.stringify([record]));
    renderLanding({ role, displayName: 'Demo reader' });
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', destination);
    expect(screen.getByRole('link', { name: 'Start Reading' })).toHaveAttribute('href', '/blogs');
    expect(screen.queryByRole('link', { name: 'Get Started Free' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Story 1' }));
    expect(screen.getByLabelText('Current route')).toHaveTextContent(`/blog/${record.id}`);
  });
});

describe('initial App route composition', () => {
  it('renders discovery at root with one public shell and a skip link', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'WriteSpace' })).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: 'Public navigation' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  });

  it.each(['/unknown', '/this-page-does-not-exist/deep'])
  ('renders the true not-found state at %s without treating it as a protected record', async path => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Page not found.' })).toBeInTheDocument();
    expect(screen.queryByText('Post not found.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Back to WriteSpace' }));
    expect(screen.getByRole('heading', { level: 1, name: 'WriteSpace' })).toBeInTheDocument();
  });
});
