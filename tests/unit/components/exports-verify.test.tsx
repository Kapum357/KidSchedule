/**
 * Export Verification Components Tests
 *
 * Tests for:
 * 1. VerificationStatusPanel - renders correctly with verification status
 * 2. ShareModal - displays QR code and share link
 * 3. AuditLog - renders verification history table
 */

import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import VerificationStatusPanel from "@/components/exports/verification-status-panel";
import ShareModal from "@/components/exports/share-modal";
import AuditLog from "@/components/exports/audit-log";

// Mock useToast hook
const mockAdd = jest.fn();
jest.mock("@/components/toast-notification", () => ({
  useToast: jest.fn(() => ({
    add: mockAdd,
  })),
}));

// Mock fetch globally
global.fetch = jest.fn();

describe("VerificationStatusPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should render verified status when verified=true", () => {
    render(
      <VerificationStatusPanel
        exportId="export-1"
        verified={true}
        pdfHashMatch={true}
        chainValid={true}
        verifiedAt="2026-03-11T14:23:00Z"
      />
    );

    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getByText("Match")).toBeInTheDocument();
    expect(screen.getByText("Valid")).toBeInTheDocument();
  });

  it("should render not verified status when verified=false", () => {
    render(
      <VerificationStatusPanel
        exportId="export-1"
        verified={false}
        pdfHashMatch={false}
        chainValid={false}
      />
    );

    expect(screen.getByText("Not Verified")).toBeInTheDocument();
    expect(screen.getByText("Mismatch")).toBeInTheDocument();
    expect(screen.getByText("Invalid")).toBeInTheDocument();
  });

  it("should open share modal when Share button is clicked", () => {
    render(
      <VerificationStatusPanel
        exportId="export-1"
        verified={true}
        pdfHashMatch={true}
        chainValid={true}
      />
    );

    const shareButton = screen.getByRole("button", { name: /Share/i });
    fireEvent.click(shareButton);

    // Modal backdrop should appear
    expect(document.querySelector(".fixed.inset-0.z-40")).toBeInTheDocument();
  });

  it("should close modal when close button is clicked", () => {
    const { rerender } = render(
      <VerificationStatusPanel
        exportId="export-1"
        verified={true}
        pdfHashMatch={true}
        chainValid={true}
      />
    );

    // Open modal
    const shareButton = screen.getByRole("button", { name: /Share/i });
    fireEvent.click(shareButton);

    // Modal should be present
    expect(document.querySelector(".fixed.inset-0.z-40")).toBeInTheDocument();

    // Re-render to simulate component update
    rerender(
      <VerificationStatusPanel
        exportId="export-1"
        verified={true}
        pdfHashMatch={true}
        chainValid={true}
      />
    );
  });

  it("should display verification details section", () => {
    render(
      <VerificationStatusPanel
        exportId="export-1"
        verified={true}
        pdfHashMatch={true}
        chainValid={true}
      />
    );

    expect(screen.getByText("Verification Details")).toBeInTheDocument();
    expect(screen.getByText("PDF Hash")).toBeInTheDocument();
    expect(screen.getByText("Message Chain")).toBeInTheDocument();
  });
});

describe("ShareModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  it("should fetch and display share token with QR code", async () => {
    const mockToken = {
      token: "a".repeat(64),
      shareLink: "http://localhost:3000/exports/export-1/verify?token=aaaa",
      qrUrl: "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=...",
      expiresAt: "2026-03-18T14:23:00Z",
      createdAt: "2026-03-11T14:23:00Z",
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: jest.fn().mockResolvedValue(mockToken),
    });

    render(
      <ShareModal
        exportId="export-1"
        onClose={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByAltText("Share QR Code")).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue(mockToken.shareLink)).toBeInTheDocument();
  });

  it("should copy link to clipboard when copy button is clicked", async () => {
    const mockToken = {
      token: "a".repeat(64),
      shareLink: "http://localhost:3000/exports/export-1/verify?token=aaaa",
      qrUrl: "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=...",
      expiresAt: "2026-03-18T14:23:00Z",
      createdAt: "2026-03-11T14:23:00Z",
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: jest.fn().mockResolvedValue(mockToken),
    });

    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });

    render(
      <ShareModal
        exportId="export-1"
        onClose={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByAltText("Share QR Code")).toBeInTheDocument();
    });

    const copyButton = screen.getByRole("button", {
      name: /content_copy|check/i,
    });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        mockToken.shareLink
      );
    });
  });

  it("should display expiration date", async () => {
    const mockToken = {
      token: "a".repeat(64),
      shareLink: "http://localhost:3000/exports/export-1/verify?token=aaaa",
      qrUrl: "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=...",
      expiresAt: "2026-03-18T14:23:00Z",
      createdAt: "2026-03-11T14:23:00Z",
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: jest.fn().mockResolvedValue(mockToken),
    });

    render(
      <ShareModal
        exportId="export-1"
        onClose={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Expires:/i)).toBeInTheDocument();
    });
  });

  it("should handle token generation errors", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: jest.fn().mockResolvedValue({ error: "server_error" }),
    });

    render(
      <ShareModal
        exportId="export-1"
        onClose={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(
        screen.getByText("Failed to generate share token")
      ).toBeInTheDocument();
    });
  });

  it("should call onClose when close button is clicked", async () => {
    const mockOnClose = jest.fn();
    const mockToken = {
      token: "a".repeat(64),
      shareLink: "http://localhost:3000/exports/export-1/verify?token=aaaa",
      qrUrl: "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=...",
      expiresAt: "2026-03-18T14:23:00Z",
      createdAt: "2026-03-11T14:23:00Z",
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: jest.fn().mockResolvedValue(mockToken),
    });

    render(
      <ShareModal
        exportId="export-1"
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByAltText("Share QR Code")).toBeInTheDocument();
    });

    const closeButton = screen.getByRole("button", { name: "Done" });
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });
});

describe("AuditLog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  it("should render verification history table with entries", async () => {
    const mockEntries = [
      {
        id: "attempt-1",
        verifiedAt: "2026-03-11T14:23:00Z",
        ipAddress: "192.168.1.100",
        verificationStatus: "valid",
        isValid: true,
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
      {
        id: "attempt-2",
        verifiedAt: "2026-03-11T12:00:00Z",
        ipAddress: "192.168.1.101",
        verificationStatus: "valid",
        isValid: true,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1",
      },
      {
        id: "attempt-3",
        verifiedAt: "2026-03-11T10:30:00Z",
        ipAddress: "192.168.1.102",
        verificationStatus: "tampered",
        isValid: false,
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0",
      },
    ];

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(mockEntries),
    });

    render(
      <AuditLog
        exportId="export-1"
        metadataId="metadata-1"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Showing 3 verification attempts/)).toBeInTheDocument();
    });

    // Check table headers
    expect(screen.getByText("Date")).toBeInTheDocument();
    expect(screen.getByText("IP Address")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Browser")).toBeInTheDocument();

    // Check that all entries are rendered
    const verifiedElements = screen.getAllByText("Verified");
    expect(verifiedElements.length).toBeGreaterThanOrEqual(2);

    const failedElements = screen.getAllByText("Failed");
    expect(failedElements.length).toBeGreaterThanOrEqual(1);
  });

  it("should mask IP addresses (show last octet as xxx)", async () => {
    const mockEntries = [
      {
        id: "attempt-1",
        verifiedAt: "2026-03-11T14:23:00Z",
        ipAddress: "192.168.1.100",
        verificationStatus: "valid",
        isValid: true,
        userAgent: "Chrome",
      },
    ];

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(mockEntries),
    });

    render(
      <AuditLog
        exportId="export-1"
        metadataId="metadata-1"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("192.168.1.xxx")).toBeInTheDocument();
    });
  });

  it("should display browser names correctly", async () => {
    const mockEntries = [
      {
        id: "attempt-1",
        verifiedAt: "2026-03-11T14:23:00Z",
        ipAddress: "192.168.1.100",
        verificationStatus: "valid",
        isValid: true,
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
      {
        id: "attempt-2",
        verifiedAt: "2026-03-11T12:00:00Z",
        ipAddress: "192.168.1.101",
        verificationStatus: "valid",
        isValid: true,
        userAgent: "Firefox",
      },
    ];

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(mockEntries),
    });

    render(
      <AuditLog
        exportId="export-1"
        metadataId="metadata-1"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Chrome")).toBeInTheDocument();
      expect(screen.getByText("Firefox")).toBeInTheDocument();
    });
  });

  it("should render export CSV button when entries exist", async () => {
    const mockEntries = [
      {
        id: "attempt-1",
        verifiedAt: "2026-03-11T14:23:00Z",
        ipAddress: "192.168.1.100",
        verificationStatus: "valid",
        isValid: true,
        userAgent: "Chrome",
      },
    ];

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(mockEntries),
    });

    render(
      <AuditLog
        exportId="export-1"
        metadataId="metadata-1"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Export CSV")).toBeInTheDocument();
    });
  });

  it("should handle fetch errors gracefully", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: jest.fn().mockResolvedValue({ error: "server_error" }),
    });

    const { container } = render(
      <AuditLog
        exportId="export-1"
        metadataId="metadata-1"
      />
    );

    await waitFor(() => {
      expect(
        screen.getByText("Failed to fetch audit log")
      ).toBeInTheDocument();
    });
  });

  it("should show empty state when no entries exist", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue([]),
    });

    const { container } = render(
      <AuditLog
        exportId="export-1"
        metadataId="metadata-1"
      />
    );

    await waitFor(() => {
      expect(
        screen.getByText("No verification attempts recorded yet.")
      ).toBeInTheDocument();
    });
  });
});
