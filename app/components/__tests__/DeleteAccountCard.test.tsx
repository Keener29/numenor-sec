import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DeleteAccountCard from '../DeleteAccountCard';
import { useNavigate } from 'react-router';
const { expect, describe, it } = require('@jest/globals');

// Mock dependencies
jest.mock('../../utils/api');
jest.mock('react-router', () => ({
  ...jest.requireActual('react-router'),
  useNavigate: jest.fn(),
}));

const mockNavigate = jest.fn();
describe('DeleteAccountCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useNavigate as jest.Mock).mockReturnValue(mockNavigate);
  });

  it('renders the delete account card with button', () => {
    render(<DeleteAccountCard accountId={123} />);

    expect(
      screen.getByText('Delete Account & Business')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Permanently delete this business account and all monitored email data.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /delete account & business/i })
    ).toBeInTheDocument();
  });

  it('opens modal when delete button is clicked', async () => {
    const user = userEvent.setup();
    render(<DeleteAccountCard accountId={123} />);

    const deleteButton = screen.getByRole('button', {
      name: /delete account & business/i,
    });
    await user.click(deleteButton);

    // Modal should appear
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });
});

