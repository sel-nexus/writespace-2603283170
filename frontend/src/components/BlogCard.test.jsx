/** Exercise exact excerpts, safe text, source metadata, navigation, and presentational purity. */
import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BlogCard, formatDate } from './BlogCard.jsx';

const POST = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'A local note',
  content: 'First paragraph.\n\nSecond paragraph.',
  createdAt: '2026-03-04T12:00:00.000Z',
  authorId: 'admin',
  authorName: 'Admin',
};

/** Mount a card and real destination routes to prove link activation rather than rendering navigates. */
function mount(props = {}) {
  return render(
    <StrictMode>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<BlogCard post={POST} {...props} />} />
          <Route path={`/blog/${POST.id}`} element={<h1>Reader destination</h1>} />
          <Route path="/login" element={<h1>Login destination</h1>} />
          <Route path={`/edit/${POST.id}`} element={<h1>Edit destination</h1>} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );
}

describe('formatDate', () => {
  it.each([
    ['2026-03-04T12:00:00.000Z', 'Mar 04, 2026'],
    ['2026-01-01T00:30:00+02:00', 'Dec 31, 2025'],
    ['2024-02-29', 'Feb 29, 2024'],
  ])('formats %s with English month, two-digit day, year, and UTC', (date, expected) => {
    expect(formatDate(date)).toBe(expected);
  });

  it.each(['not-a-date', '', undefined])('shows a safe unavailable date for %s', date => {
    expect(formatDate(date)).toBe('Date unavailable');
  });
});

describe('BlogCard', () => {
  it('shows title, exact short content, author, date, and built-in admin avatar', () => {
    mount();
    expect(screen.getByRole('heading', { name: POST.title })).toBeInTheDocument();
    expect(document.querySelector('article > p').textContent).toBe(POST.content);
    expect(document.querySelector('time')).toHaveAttribute('dateTime', POST.createdAt);
    expect(screen.getByText('Mar 04, 2026')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Admin avatar' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it.each([0, 1, 119, 120, 121, 10000])('renders exactly the first 120 JS characters for length %s', length => {
    const content = 'a'.repeat(length);
    mount({ post: { ...POST, content } });
    expect(document.querySelector('article > p').textContent).toBe(content.slice(0, 120));
  });

  it('counts UTF-16 JavaScript characters rather than changing the source excerpt', () => {
    const content = `${'a'.repeat(119)}😀the rest`;
    mount({ post: { ...POST, content } });
    expect(document.querySelector('article > p').textContent).toBe(content.slice(0, 120));
    expect(document.querySelector('article > p').textContent).toHaveLength(120);
  });

  it('escapes title, author, and content instead of rendering HTML or script elements', () => {
    const title = '<img src=x onerror=alert(1)>';
    const content = '<script>alert(1)</script>\n<b>literal text</b>';
    mount({ post: { ...POST, title, content, authorName: '<em>Writer</em>' } });
    expect(screen.getByRole('link', { name: title })).toBeInTheDocument();
    expect(document.querySelector('article > p').textContent).toBe(content);
    expect(screen.getByText('<em>Writer</em>')).toBeInTheDocument();
    expect(document.querySelector('article img, article script, article b, article em')).toBeNull();
    expect(document.querySelector('article > p')).toHaveClass('whitespace-pre-wrap', 'break-words');
  });

  it.each([
    [0, 'border-t-indigo-500'], [1, 'border-t-violet-500'], [2, 'border-t-pink-500'],
    [3, 'border-t-teal-500'], [4, 'border-t-indigo-500'], [-1, 'border-t-indigo-500'],
  ])('cycles top accent at position %s safely', (index, accent) => {
    mount({ index });
    expect(document.querySelector('article')).toHaveClass(accent, 'min-w-0');
  });

  it('uses ordinary user fallback for an absent author account', () => {
    mount({ post: { ...POST, authorId: 'former-user', authorName: 'Former Writer' } });
    expect(screen.getByRole('img', { name: 'User avatar' })).toBeInTheDocument();
    expect(screen.getByText('Former Writer')).toBeInTheDocument();
  });

  it('honors a resolved registered administrator role rather than treating every UUID author as user', () => {
    mount({ post: { ...POST, authorId: 'registered-admin' }, authorRole: 'admin' });
    expect(screen.getByRole('img', { name: 'Admin avatar' })).toBeInTheDocument();
  });

  it('shows the safe invalid-date state without crashing the card', () => {
    mount({ post: { ...POST, createdAt: 'bad-date' } });
    expect(screen.getByText('Date unavailable')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: POST.title })).toBeInTheDocument();
  });

  it.each([false, true])('navigates only on explicit activation, with guest=%s', async guest => {
    const user = userEvent.setup();
    mount({ guest });
    const link = screen.getByRole('link', { name: POST.title });
    expect(link).toHaveAttribute('href', guest ? '/login' : `/blog/${POST.id}`);
    expect(screen.queryByRole('heading', { name: /destination/ })).not.toBeInTheDocument();
    await user.click(link);
    expect(screen.getByRole('heading', { name: guest ? 'Login destination' : 'Reader destination' })).toBeInTheDocument();
  });

  it.each([
    [{ userId: 'admin', role: 'admin' }, true],
    [{ userId: 'writer', role: 'user' }, true],
    [{ userId: 'other', role: 'user' }, false],
    [null, false],
  ])('shows Edit only to the supplied authorized session %j', (session, allowed) => {
    mount({ post: { ...POST, authorId: 'writer' }, session });
    const edit = screen.queryByRole('link', { name: 'Edit' });
    if (allowed) {
      expect(edit).toHaveAttribute('href', `/edit/${POST.id}`);
      expect(screen.getByRole('link', { name: POST.title })).not.toContainElement(edit);
    } else expect(edit).not.toBeInTheDocument();
  });

  it('never shows a management link on guest previews even with an administrator prop', () => {
    mount({ guest: true, session: { userId: 'admin', role: 'admin' } });
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('activates the separate Edit link without activating the main reader link', async () => {
    const user = userEvent.setup();
    mount({ session: { userId: 'admin', role: 'admin' } });
    await user.click(screen.getByRole('link', { name: 'Edit' }));
    expect(screen.getByRole('heading', { name: 'Edit destination' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Reader destination' })).not.toBeInTheDocument();
  });

  it('never mutates its frozen post or storage on render', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    const uuid = vi.spyOn(window.crypto, 'randomUUID');
    mount({ post: Object.freeze({ ...POST }) });
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(uuid).not.toHaveBeenCalled();
    expect(POST.content).toBe('First paragraph.\n\nSecond paragraph.');
  });
});
