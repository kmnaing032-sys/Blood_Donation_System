import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DeveloperBranding } from '../DeveloperBranding';

describe('DeveloperBranding Component', () => {
  it('renders the branding container and SVG monogram logo', () => {
    render(<DeveloperBranding />);

    const footer = screen.getByTestId('developer-branding');
    expect(footer).toBeDefined();

    const logo = screen.getByTestId('developer-logo');
    expect(logo).toBeDefined();

    // Check SVG text content contains "KM"
    const kmText = logo.querySelector('text');
    expect(kmText).not.toBeNull();
    expect(kmText.textContent).toBe('KM');
  });

  it('renders the exact developer credit text', () => {
    render(<DeveloperBranding />);

    expect(screen.getByText('Developed by')).toBeDefined();
    expect(screen.getByText('Kyaw Moe Naing')).toBeDefined();
  });

  it('applies custom className when provided', () => {
    render(<DeveloperBranding className="custom-test-class" />);

    const footer = screen.getByTestId('developer-branding');
    expect(footer.className).toContain('custom-test-class');
  });
});
