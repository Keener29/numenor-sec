import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DeleteConfirmModal from '../DeleteConfirmModal';
import { authAPI } from '../../utils/api';
import { useNavigate } from 'react-router';

// Mock dependencies
jest.mock('../../utils/api');
jest.mock('react-router', () => ({
  ...jest.requireActual('react-router'),
  useNavigate: jest.fn(),
}));

const mockNavigate = jest.fn();
const mockAuthAPI = authAPI as jest.Mocked<typeof authAPI>;

describe('DeleteConfirmModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useNavigate as jest.Mock).mockReturnValue(mockNavigate);
    mockAuthAPI.deleteAccount = jest.fn().mockResolvedValue({
      status: 'deleted',
      accountId: 123,
      businessDeleted: true,
    });
  });

  it('does not render when isOpen is false', () => {
    render(
      <DeleteConfirmModal
        isOpen={false}
        onClose={jest.fn()}
        accountId={123}
      />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders modal with correct content when open', () => {
    render(
      <DeleteConfirmModal
        isOpen={true}
        onClose={jest.fn()}
        accountId={123}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
    expect(
      screen.getByText(
        /This action is permanent. Your business, account, and all monitored emails will be deleted and cannot be recovered/i
      )
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Reason for leaving \(optional\)/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });

  it('has correct ARIA attributes', () => {
    render(
      <DeleteConfirmModal
        isOpen={true}
        onClose={jest.fn()}
        accountId={123}
      />
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'delete-modal-title');
    expect(dialog).toHaveAttribute(
      'aria-describedby',
      'delete-modal-description'
    );
  });

  it('focuses cancel button when modal opens', async () => {
    render(
      <DeleteConfirmModal
        isOpen={true}
        onClose={jest.fn()}
        accountId={123}
      />
    );

    await waitFor(() => {
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      expect(cancelButton).toHaveFocus();
    });
  });

  it('closes modal when cancel button is clicked', async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();
    render(
      <DeleteConfirmModal
        isOpen={true}
        onClose={onClose}
        accountId={123}
      />
    );

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes modal when Escape key is pressed', async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();
    render(
      <DeleteConfirmModal
        isOpen={true}
        onClose={onClose}
        accountId={123}
      />
    );

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close modal when Escape is pressed during deletion', async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();
  
    mockAuthAPI.deleteAccount = jest
      .fn()
      .mockResolvedValue({
        status: 'deleted',
        accountId: 123,
        businessDeleted: true,
      });
  
    render(<DeleteConfirmModal isOpen onClose={onClose} accountId={123} />);
  
    await user.click(screen.getByRole('button', { name: /delete/i }));
  
    // Try to press Escape while deleting
    await user.keyboard('{Escape}');
  
    expect(onClose).not.toHaveBeenCalled();
  });
  

  it('allows user to enter optional reason', async () => {
    const user = userEvent.setup();
    render(
      <DeleteConfirmModal
        isOpen={true}
        onClose={jest.fn()}
        accountId={123}
      />
    );

    const reasonTextarea = screen.getByLabelText(
      /Reason for leaving \(optional\)/i
    );
    await user.type(reasonTextarea, 'Testing reason');

    expect(reasonTextarea).toHaveValue('Testing reason');
  });

  it('calls deleteAccount API and navigates on successful deletion', async () => {
    const user = userEvent.setup();
    render(
      <DeleteConfirmModal
        isOpen={true}
        onClose={jest.fn()}
        accountId={123}
      />
    );

    const deleteButton = screen.getByRole('button', { name: /delete/i });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(mockAuthAPI.deleteAccount).toHaveBeenCalledWith(123, undefined);
      expect(mockNavigate).toHaveBeenCalledWith('/account-deleted');
    });
  });

  it('sends reason in API call when provided', async () => {
    const user = userEvent.setup();
    render(
      <DeleteConfirmModal
        isOpen={true}
        onClose={jest.fn()}
        accountId={123}
      />
    );

    const reasonTextarea = screen.getByLabelText(
      /Reason for leaving \(optional\)/i
    );
    await user.type(reasonTextarea, 'Not satisfied with service');

    const deleteButton = screen.getByRole('button', { name: /delete/i });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(mockAuthAPI.deleteAccount).toHaveBeenCalledWith(
        123,
        'Not satisfied with service'
      );
    });
  });

  it('shows loading state during deletion', async () => {
    const user = userEvent.setup();
  
    mockAuthAPI.deleteAccount = jest.fn().mockResolvedValue({
      status: 'deleted',
      accountId: 123,
      businessDeleted: true,
    });
  
    render(<DeleteConfirmModal isOpen onClose={jest.fn()} accountId={123} />);
  
    const deleteButton = screen.getByRole('button', { name: /delete/i });
    await user.click(deleteButton);
  
    expect(screen.getByText(/deleting.../i)).toBeInTheDocument();
    expect(deleteButton).toBeDisabled();
  });
  

  it('disables cancel button during deletion', async () => {
    const user = userEvent.setup();
  
    mockAuthAPI.deleteAccount = jest.fn().mockResolvedValue({
      status: 'deleted',
      accountId: 123,
      businessDeleted: true,
    });
  
    render(<DeleteConfirmModal isOpen onClose={jest.fn()} accountId={123} />);
  
    const deleteButton = screen.getByRole('button', { name: /delete/i });
    await user.click(deleteButton);
  
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    expect(cancelButton).toBeDisabled();
  });
  

  it('displays error message on API failure', async () => {
    const user = userEvent.setup();
    const errorMessage = 'Could not delete account. Try again or contact support.';
    mockAuthAPI.deleteAccount = jest.fn().mockRejectedValue(
      new Error(errorMessage)
    );

    render(
      <DeleteConfirmModal
        isOpen={true}
        onClose={jest.fn()}
        accountId={123}
      />
    );

    const deleteButton = screen.getByRole('button', { name: /delete/i });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });

    // Delete button should be re-enabled
    expect(deleteButton).not.toBeDisabled();
  });

  it('allows dismissing error message', async () => {
    const user = userEvent.setup();
    mockAuthAPI.deleteAccount = jest.fn().mockRejectedValue(new Error('Test error')) as jest.MockedFunction<typeof mockAuthAPI.deleteAccount>;

    render(
      <DeleteConfirmModal
        isOpen={true}
        onClose={jest.fn()}
        accountId={123}
      />
    );

    const deleteButton = screen.getByRole('button', { name: /delete/i });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    const dismissButton = screen.getByLabelText(/dismiss error/i);
    await user.click(dismissButton);

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});

