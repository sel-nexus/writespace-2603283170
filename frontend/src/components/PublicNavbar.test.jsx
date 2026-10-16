/** Verify public navigation semantics and activation-only mobile state changes. */
import { StrictMode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { PublicNavbar } from './PublicNavbar.jsx';

/** Expose route state without replacing native link activation. */
function Location() {
  const location = useLocation();
  return (
    <output aria-label="Current route">
      {location.pathname}
    </output>
  );
}

/** Render the real navbar under one in-memory router and StrictMode. */
function renderNavbar(session = null, initialPath = '/') {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[initialPath]}>
        <PublicNavbar session={session} />
        <Location />
        <Routes>
          <Route path="*" element={null} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );
}

describe('PublicNavbar', () => {
  it('renders the brand and three public navigation links with native destinations', () => {
    renderNavbar();
    expect(screen.getByRole('link', { name: 'WriteSpace' })).toHaveAttribute('href', '/');
    const nav = screen.getByRole('navigation', { name: 'Public navigation' });
    expect(within(nav).getAllByRole('link')).toHaveLength(3);
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(within(nav).getByRole('link', { name: 'Login' })).toHaveAttribute('href', '/login');
    expect(within(nav).getByRole('link', { name: 'Register' })).toHaveAttribute('href', '/register');
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  });

  it('starts collapsed and binds the toggle to its named navigation', () => {
    renderNavbar();
    const toggle = screen.getByRole('button', { name: 'Open navigation' });
    const nav = screen.getByRole('navigation', { name: 'Public navigation' });
    expect(toggle).toHaveAttribute('type', 'button');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', nav.id);
    expect(nav).toHaveClass('hidden', 'sm:flex');
    expect(toggle).toHaveClass('sm:hidden', 'min-h-11');
  });

  it('opens and closes the same menu only on button clicks', async () => {
    const user = userEvent.setup();
    renderNavbar();
    const nav = screen.getByRole('navigation', { name: 'Public navigation' });
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.getByRole('button', { name: 'Close navigation' })).toHaveAttribute('aria-expanded', 'true');
    expect(nav).toHaveClass('flex');
    expect(nav).not.toHaveClass('hidden');
    await user.click(screen.getByRole('button', { name: 'Close navigation' }));
    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false');
    expect(nav).toHaveClass('hidden');
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/');
  });

  it('supports native Enter and Space activation while retaining toggle focus', async () => {
    const user = userEvent.setup();
    renderNavbar();
    const toggle = screen.getByRole('button', { name: 'Open navigation' });
    toggle.focus();
    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveFocus();
    await user.keyboard(' ');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
  });

  it('does not toggle, navigate, or write on render, rerender, focus, or hover', async () => {
    const user = userEvent.setup();
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const view = renderNavbar();
    const toggle = screen.getByRole('button', { name: 'Open navigation' });
    toggle.focus();
    await user.hover(toggle);
    view.rerender(
      <StrictMode>
        <MemoryRouter>
          <PublicNavbar />
          <Location />
        </MemoryRouter>
      </StrictMode>,
    );
    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/');
    expect(write).not.toHaveBeenCalled();
  });

  it.each([['Login', '/login'], ['Register', '/register'], ['Home', '/']])
  ('navigates via the %s link only when activated', async (name, destination) => {
    const user = userEvent.setup();
    renderNavbar(null, '/unknown');
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/unknown');
    await user.click(screen.getByRole('link', { name }));
    expect(screen.getByLabelText('Current route')).toHaveTextContent(destination);
  });

  it('does not implicitly toggle the open mobile disclosure when a link is activated', async () => {
    const user = userEvent.setup();
    renderNavbar();
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    await user.click(screen.getByRole('link', { name: 'Login' }));
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/login');
    expect(screen.getByRole('button', { name: 'Close navigation' })).toHaveAttribute('aria-expanded', 'true');
  });

  it.each([['user', 'My space', '/blogs'], ['admin', 'Dashboard', '/admin']])
  ('offers the optional %s role home without guest account links', (role, label, destination) => {
    renderNavbar({ role, displayName: 'Local writer' });
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', destination);
    expect(screen.queryByRole('link', { name: 'Login' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Register' })).not.toBeInTheDocument();
  });

  it('assigns unique disclosure IDs to separate instances', () => {
    render(
      <MemoryRouter>
        <PublicNavbar />
        <PublicNavbar />
      </MemoryRouter>,
    );
    const toggles = screen.getAllByRole('button', { name: 'Open navigation' });
    expect(toggles[0].getAttribute('aria-controls')).not.toBe(toggles[1].getAttribute('aria-controls'));
  });
});
