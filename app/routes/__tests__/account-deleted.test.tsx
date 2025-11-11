import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router';
import AccountDeletedPage from '../account-deleted';
import { describe, expect, it } from '@jest/globals';

// Helper to render with router
const renderWithRouter = (ui: React.ReactElement) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
};

describe('AccountDeletedPage', () => {
  it('renders the account deleted page with correct content', () => {
    renderWithRouter(<AccountDeletedPage />);

    expect(screen.getByText('Account deleted')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Your business, account, and monitored emails have been permanently deleted/i
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Monitoring has stopped and no more scanning will occur/i)
    ).toBeInTheDocument();
  });

  it('renders a link to return home', () => {
    renderWithRouter(<AccountDeletedPage />);

    const homeLink = screen.getByRole('link', { name: /return to home/i });
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveAttribute('href', '/');
  });
});

