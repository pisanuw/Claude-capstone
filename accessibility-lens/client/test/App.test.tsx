import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App.js';
import { IssueCard } from '../src/components/IssueCard.js';
import { ReadingOrderView } from '../src/components/ReadingOrderView.js';
import type { Issue, Report } from '../src/lib/types.js';

const sampleIssue: Issue = {
  ruleId: 'img-alt',
  title: 'Image missing alt text',
  severity: 'serious',
  wcagCriterion: '1.1.1 Non-text Content',
  wcagLevel: 'A',
  profiles: ['screen-reader'],
  impact: 'Screen readers announce nothing useful.',
  selector: 'img#logo',
  snippet: '<img id="logo" src="x.png">',
  suggestedFix: 'Add a descriptive alt attribute.',
};

const sampleReport: Report = {
  url: 'https://example.com',
  fetchedAt: '2026-05-21T00:00:00Z',
  pageTitle: 'Example',
  lang: 'en',
  issues: [sampleIssue],
  summary: { minor: 0, moderate: 0, serious: 1, critical: 0 },
  profileScores: [
    { profile: 'screen-reader', score: 88, issueCount: 1 },
    { profile: 'low-vision', score: 100, issueCount: 0 },
    { profile: 'color-blindness', score: 100, issueCount: 0 },
    { profile: 'keyboard-only', score: 100, issueCount: 0 },
  ],
  readingOrder: [
    { role: 'heading', level: 1, text: 'Welcome' },
    { role: 'link', text: 'Read the docs' },
  ],
  score: 88,
};

describe('IssueCard', () => {
  it('renders the issue title, WCAG ref, and fix', async () => {
    render(<IssueCard issue={sampleIssue} />);
    expect(screen.getByText('Image missing alt text')).toBeInTheDocument();
    expect(screen.getByText(/1.1.1 Non-text Content/)).toBeInTheDocument();
    expect(screen.getByText('Serious')).toBeInTheDocument();
    expect(screen.getByText(/Add a descriptive alt attribute/)).toBeInTheDocument();
  });
});

describe('ReadingOrderView', () => {
  it('lists each announced node with its role', () => {
    render(<ReadingOrderView nodes={sampleReport.readingOrder} />);
    expect(screen.getByText('Welcome')).toBeInTheDocument();
    expect(screen.getByText('Read the docs')).toBeInTheDocument();
  });

  it('shows an empty-state message when there is nothing to announce', () => {
    render(<ReadingOrderView nodes={[]} />);
    expect(screen.getByText(/No announceable content/)).toBeInTheDocument();
  });
});

describe('App', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the hero and form on first load', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/four kinds of eyes/i);
    expect(screen.getByLabelText(/Page URL to scan/i)).toBeInTheDocument();
  });

  it('runs a scan and renders the report', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => sampleReport,
    } as Response);

    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText(/Page URL to scan/i), 'https://example.com');
    await user.click(screen.getByRole('button', { name: /Scan page/i }));

    await waitFor(() => {
      expect(screen.getByText(/Overall accessibility score/i)).toBeInTheDocument();
    });
    expect(screen.getAllByText('88').length).toBeGreaterThanOrEqual(1);
    // The screen-reader tab is active by default and shows the reading order.
    expect(screen.getByText('Welcome')).toBeInTheDocument();
  });

  it('shows a friendly error when the scan fails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: 'Refusing to fetch internal addresses.' }),
    } as Response);

    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText(/Page URL to scan/i), 'http://localhost');
    await user.click(screen.getByRole('button', { name: /Scan page/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/internal addresses/i);
    });
  });

  it('switches profile tabs to reveal profile-specific simulations', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => sampleReport,
    } as Response);

    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText(/Page URL to scan/i), 'https://example.com');
    await user.click(screen.getByRole('button', { name: /Scan page/i }));
    await waitFor(() => screen.getByRole('tablist'));

    await user.click(screen.getByRole('tab', { name: /Color blindness/i }));
    expect(screen.getByText(/status colors apart/i)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Low vision/i }));
    const blur = screen.getByLabelText(/Reduced acuity/i);
    expect(blur).toBeInTheDocument();
    await user.click(blur);

    await user.click(screen.getByRole('tab', { name: /Keyboard only/i }));
    expect(screen.getByText(/move with Tab/i)).toBeInTheDocument();
  });
});
