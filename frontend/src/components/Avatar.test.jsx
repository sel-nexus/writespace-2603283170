/** Verify both source avatar roles and safe ordinary-user fallback without persistence effects. */
import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Avatar, getAvatar } from './Avatar.jsx';

/** Mount a helper result so assertions exercise its rendered accessible output. */
function mountRole(role) {
  return render(
    <StrictMode>
      {getAvatar(role)}
    </StrictMode>,
  );
}

describe('Avatar and getAvatar', () => {
  it.each([
    ['admin', 'Admin avatar', '👑', 'bg-violet-600'],
    ['user', 'User avatar', '📖', 'bg-indigo-500'],
  ])('renders the source %s emoji and role color', (role, label, emoji, color) => {
    mountRole(role);
    const avatar = screen.getByRole('img', { name: label });
    expect(avatar).toHaveTextContent(emoji);
    expect(avatar).toHaveClass(color, 'rounded-full', 'shrink-0');
    expect(avatar.firstChild).toHaveAttribute('aria-hidden', 'true');
  });

  it.each([undefined, '', 'ADMIN', 'guest', '__proto__', 'constructor'])(
    'falls back to the user appearance for unsupported role %s', role => {
      mountRole(role);
      expect(screen.getByRole('img', { name: 'User avatar' })).toHaveClass('bg-indigo-500');
      expect(screen.getByRole('img')).toHaveTextContent('📖');
      expect(screen.queryByRole('img', { name: 'Admin avatar' })).not.toBeInTheDocument();
    },
  );

  it('uses the default user role when rendered directly without props', () => {
    render(
      <Avatar />,
    );
    expect(screen.getByRole('img', { name: 'User avatar' })).toHaveTextContent('📖');
  });

  it('does not write, remove, or generate identity on StrictMode rendering', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    const uuid = vi.spyOn(window.crypto, 'randomUUID');
    mountRole('admin');
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(uuid).not.toHaveBeenCalled();
  });
});
