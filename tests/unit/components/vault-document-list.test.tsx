import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VaultDocumentList } from '@/components/vault/document-list';

// Mock fetch globally
global.fetch = jest.fn();

const mockDocuments = [
  {
    id: 'doc-1',
    familyId: 'fam-1',
    title: 'Birth Certificate',
    fileType: 'application/pdf',
    status: 'available',
    statusLabel: 'Available',
    sizeBytes: 102400,
    url: 'https://example.com/doc-1.pdf',
    addedAt: '2024-03-12T10:00:00Z',
    addedBy: 'user-1',
    updatedAt: '2024-03-12T10:00:00Z',
  },
  {
    id: 'doc-2',
    familyId: 'fam-1',
    title: 'School Report',
    fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    status: 'pending_signature',
    statusLabel: 'Pending Signature',
    sizeBytes: 204800,
    url: 'https://example.com/doc-2.docx',
    addedAt: '2024-03-11T10:00:00Z',
    addedBy: 'user-1',
    updatedAt: '2024-03-11T10:00:00Z',
  },
  {
    id: 'doc-3',
    familyId: 'fam-1',
    title: 'Insurance Document',
    fileType: 'application/pdf',
    status: 'signed',
    statusLabel: 'Signed',
    sizeBytes: 51200,
    url: 'https://example.com/doc-3.pdf',
    addedAt: '2024-03-10T10:00:00Z',
    addedBy: 'user-1',
    updatedAt: '2024-03-10T10:00:00Z',
  },
];

const mockQuota = {
  maxDocuments: 20,
  currentDocuments: 3,
  maxStorageBytes: 104857600,
  usedStorageBytes: 358400,
  documentPercentFull: 15,
  storagePercentFull: 0,
  canUpload: true,
};

const mockResponse = {
  documents: mockDocuments,
  quota: mockQuota,
  pagination: {
    limit: 20,
    offset: 0,
    total: 3,
  },
};

describe('VaultDocumentList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });
  });

  describe('render', () => {
    it('renders loading state initially', () => {
      (global.fetch as jest.Mock).mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                ok: true,
                json: async () => mockResponse,
              });
            }, 100);
          })
      );

      render(<VaultDocumentList />);

      // Should show skeleton loaders
      const skeletons = document.querySelectorAll('.bg-slate-200');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('renders documents in table format after loading', async () => {
      render(<VaultDocumentList />);

      await waitFor(() => {
        expect(screen.getByText('Birth Certificate')).toBeInTheDocument();
        expect(screen.getByText('School Report')).toBeInTheDocument();
        expect(screen.getByText('Insurance Document')).toBeInTheDocument();
      });
    });

    it('renders all table columns', async () => {
      render(<VaultDocumentList />);

      await waitFor(() => {
        expect(screen.getByText(/Title/i)).toBeInTheDocument();
        expect(screen.getByText(/Type/i)).toBeInTheDocument();
        expect(screen.getByText(/Status/i)).toBeInTheDocument();
        expect(screen.getByText(/Size/i)).toBeInTheDocument();
        expect(screen.getByText(/Date/i)).toBeInTheDocument();
        expect(screen.getByText(/Actions/i)).toBeInTheDocument();
      });
    });

    it('displays document status badges with correct colors', async () => {
      render(<VaultDocumentList />);

      await waitFor(() => {
        const availableBadge = screen.getByText('Available');
        const pendingBadge = screen.getByText('Pending Signature');
        const signedBadge = screen.getByText('Signed');

        // Check badge colors
        expect(availableBadge.className).toContain('bg-green-100');
        expect(pendingBadge.className).toContain('bg-yellow-100');
        expect(signedBadge.className).toContain('bg-blue-100');
      });
    });

    it('formats file sizes correctly', async () => {
      render(<VaultDocumentList />);

      await waitFor(() => {
        expect(screen.getByText('100 KB')).toBeInTheDocument();
        expect(screen.getByText('200 KB')).toBeInTheDocument();
        expect(screen.getByText('50 KB')).toBeInTheDocument();
      });
    });

    it('formats dates in readable format', async () => {
      render(<VaultDocumentList />);

      await waitFor(() => {
        // Date formats are in short form like "Mar 12, 2024"
        const dateElements = screen.getAllByText(/2024/);
        expect(dateElements.length).toBeGreaterThan(0);
      });
    });

    it('renders download and delete action buttons', async () => {
      render(<VaultDocumentList />);

      await waitFor(() => {
        const downloadButtons = screen.getAllByTitle('Download document');
        const deleteButtons = screen.getAllByTitle('Delete document');

        expect(downloadButtons).toHaveLength(3);
        expect(deleteButtons).toHaveLength(3);
      });
    });

    it('shows pagination controls', async () => {
      render(<VaultDocumentList />);

      await waitFor(() => {
        expect(screen.getByText(/Showing 1 to 3 of 3/)).toBeInTheDocument();
        // Check that page text contains "Page"
        expect(screen.getByText(/^Page/)).toBeInTheDocument();
      });
    });

    it('disables previous button on first page', async () => {
      render(<VaultDocumentList />);

      await waitFor(() => {
        const prevButton = screen.getByTitle('Previous page');
        expect(prevButton).toBeDisabled();
      });
    });

    it('disables next button on last page', async () => {
      render(<VaultDocumentList />);

      await waitFor(() => {
        const nextButton = screen.getByTitle('Next page');
        expect(nextButton).toBeDisabled();
      });
    });
  });

  describe('error handling', () => {
    it('renders error state when fetch fails', async () => {
      const errorMessage = 'Failed to fetch documents';
      (global.fetch as jest.Mock).mockRejectedValue(new Error(errorMessage));

      render(<VaultDocumentList />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load documents')).toBeInTheDocument();
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });
    });

    it('shows retry button on error', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      render(<VaultDocumentList />);

      await waitFor(() => {
        expect(screen.getByText('Try Again')).toBeInTheDocument();
      });
    });

    it('shows try again button on error', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      render(<VaultDocumentList />);

      await waitFor(() => {
        expect(screen.getByText('Try Again')).toBeInTheDocument();
      });
    });
  });

  describe('empty state', () => {
    it('renders empty state when no documents', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          ...mockResponse,
          documents: [],
          pagination: { ...mockResponse.pagination, total: 0 },
        }),
      });

      render(<VaultDocumentList />);

      await waitFor(() => {
        expect(screen.getByText('No documents yet')).toBeInTheDocument();
        expect(
          screen.getByText('Upload your first document to get started')
        ).toBeInTheDocument();
      });
    });
  });

  describe('pagination', () => {
    it('fetches with correct offset on page change', async () => {
      const multiPageResponse = {
        ...mockResponse,
        pagination: {
          limit: 20,
          offset: 0,
          total: 40,
        },
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => multiPageResponse,
      });

      render(<VaultDocumentList />);

      await waitFor(() => {
        expect(screen.getByText(/Showing 1 to/)).toBeInTheDocument();
      });

      const nextButton = screen.getByTitle('Next page');
      fireEvent.click(nextButton);

      // Should fetch with offset=20
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/school/vault?limit=20&offset=20',
          expect.any(Object)
        );
      });
    });

    it('enables next button when more pages available', async () => {
      const multiPageResponse = {
        ...mockResponse,
        pagination: {
          limit: 20,
          offset: 0,
          total: 40,
        },
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => multiPageResponse,
      });

      render(<VaultDocumentList />);

      await waitFor(() => {
        const nextButton = screen.getByTitle('Next page');
        expect(nextButton).not.toBeDisabled();
      });
    });
  });

  describe('user interactions', () => {
    it('calls onDeleteClick when delete button clicked', async () => {
      const onDeleteClick = jest.fn();

      render(<VaultDocumentList onDeleteClick={onDeleteClick} />);

      await waitFor(() => {
        const deleteButtons = screen.getAllByTitle('Delete document');
        fireEvent.click(deleteButtons[0]);
      });

      expect(onDeleteClick).toHaveBeenCalledWith(mockDocuments[0]);
    });

    it('calls onDownloadClick when download button clicked', async () => {
      const onDownloadClick = jest.fn();

      render(
        <VaultDocumentList
          onDownloadClick={onDownloadClick}
          onDeleteClick={() => {}}
        />
      );

      await waitFor(() => {
        const downloadButtons = screen.getAllByTitle('Download document');
        fireEvent.click(downloadButtons[0]);
      });

      expect(onDownloadClick).toHaveBeenCalledWith(mockDocuments[0]);
    });

    it('opens download URL when no onDownloadClick callback', async () => {
      // Mock window.open
      const mockOpen = jest.fn();
      window.open = mockOpen;

      render(<VaultDocumentList />);

      await waitFor(() => {
        const downloadButtons = screen.getAllByTitle('Download document');
        fireEvent.click(downloadButtons[0]);
      });

      expect(mockOpen).toHaveBeenCalledWith(
        mockDocuments[0].url,
        '_blank'
      );
    });
  });

  describe('file type icons', () => {
    it('shows correct icon for PDF files', async () => {
      render(<VaultDocumentList />);

      await waitFor(() => {
        const icons = screen.getAllByTitle('application/pdf');
        expect(icons.length).toBeGreaterThan(0);
        // PDF documents should have picture_as_pdf icon
        expect(icons[0].textContent).toContain('picture_as_pdf');
      });
    });

    it('shows correct icon for Word documents', async () => {
      const wordDocResponse = {
        ...mockResponse,
        documents: [
          {
            ...mockDocuments[1],
          },
        ],
        pagination: { limit: 20, offset: 0, total: 1 },
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => wordDocResponse,
      });

      render(<VaultDocumentList />);

      await waitFor(() => {
        const icon = screen.getByTitle(
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        );
        expect(icon.textContent).toContain('description');
      });
    });
  });

  describe('accessibility', () => {
    it('has accessible table structure', async () => {
      render(<VaultDocumentList />);

      await waitFor(() => {
        const table = screen.getByRole('table', { hidden: true });
        expect(table).toBeInTheDocument();
      });
    });

    it('buttons have descriptive titles', async () => {
      render(<VaultDocumentList />);

      await waitFor(() => {
        expect(screen.getAllByTitle('Download document').length).toBeGreaterThan(
          0
        );
        expect(screen.getAllByTitle('Delete document').length).toBeGreaterThan(0);
      });
    });

    it('pagination buttons have titles', async () => {
      render(<VaultDocumentList />);

      await waitFor(() => {
        expect(screen.getByTitle('Previous page')).toBeInTheDocument();
        expect(screen.getByTitle('Next page')).toBeInTheDocument();
      });
    });
  });

  describe('API requests', () => {
    it('fetches with correct default parameters', async () => {
      render(<VaultDocumentList />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/school/vault?limit=20&offset=0',
          {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          }
        );
      });
    });

    it('uses correct header format', async () => {
      render(<VaultDocumentList />);

      await waitFor(() => {
        const calls = (global.fetch as jest.Mock).mock.calls;
        expect(calls[0][1].headers['Content-Type']).toBe('application/json');
      });
    });
  });
});
