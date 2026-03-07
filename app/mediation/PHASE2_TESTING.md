# Mediation Center Phase 2 - Integration Testing Checklist

This document outlines the complete testing strategy for Phase 2 features: Send Suggestion, Adjust Tone, Dismiss Warning, Warning History, and De-escalation Tips.

## Test Plan Overview

- **Environment**: Local dev server (`pnpm dev` on http://localhost:3000)
- **Browser**: Chrome, Safari (at minimum)
- **Duration**: ~45 minutes for complete manual walkthrough
- **Automated tests**: Jest unit tests + Playwright e2e tests

---

## 1. Send Suggestion Feature

### Manual Test Steps

1. **Navigate to Mediation Page**
   - [ ] Go to `/mediation`
   - [ ] Verify sidebar shows "Mediation Center" as active
   - [ ] Confirm "Warning Log" link is visible in sidebar

2. **Select a Topic**
   - [ ] Click on a topic in the left sidebar
   - [ ] Verify topic title and status display in chat area
   - [ ] Confirm AI message appears with draft suggestion loaded

3. **Draft Text Input**
   - [ ] Click in the draft suggestion textarea
   - [ ] Type a test message (e.g., "Can we adjust the Tuesday pickup time?")
   - [ ] Verify character count updates (e.g., "45/2000 characters")
   - [ ] Test paste with long text; verify truncation at 2000 chars

4. **Send Button Behavior**
   - [ ] With empty text: Send button should be **disabled** (grayed out)
   - [ ] Add text: Send button should be **enabled** (clickable)
   - [ ] Click "Send Suggestion" button
   - [ ] Verify loading state: button text shows "Sending..." and is disabled
   - [ ] Wait for response; button returns to "Send Suggestion"

5. **Success Feedback**
   - [ ] After successful send, a success message appears (e.g., "Suggestion sent successfully!")
   - [ ] Message appears in green/emerald success style
   - [ ] Draft text is cleared from textarea
   - [ ] Character count resets to "0/2000"

6. **Error Handling**
   - [ ] Trigger error by sending with invalid recipient (if backend rejects)
   - [ ] Verify error message displays in red/error style
   - [ ] Error message is clear (e.g., "Failed to send suggestion: ...")
   - [ ] Draft text is **not** cleared so user can retry

### Automated Tests

- [ ] Unit test: `sendMediationSuggestion` validates text length (min 1, max 2000 chars)
- [ ] Unit test: `sendMediationSuggestion` checks parent and family scoping
- [ ] Unit test: `sendMediationSuggestion` creates correct message thread
- [ ] E2E test: Complete happy path from draft to send to success message

---

## 2. Adjust Tone Buttons

### Manual Test Steps

1. **Button Visibility**
   - [ ] Three tone buttons visible below draft textarea
   - [ ] Buttons labeled: "🤝 Make Gentler", "✂️ Make Shorter", "💙 Make Warmer"
   - [ ] Buttons use light styling with hover effects

2. **Button States**
   - [ ] With empty draft: All buttons **disabled** (grayed out)
   - [ ] With text in draft: All buttons **enabled** (clickable)
   - [ ] During adjustment: Buttons show **disabled** state, main UI does not freeze

3. **Tone Adjustment - Gentler**
   - [ ] Type: "I can't believe you're always late for pickups!"
   - [ ] Click "🤝 Make Gentler"
   - [ ] Wait for adjustment (loading indicator, if shown)
   - [ ] Verify draft text is rewritten to be less confrontational
   - [ ] Example expected: "Would it be possible to aim for pickup at 3:15 PM?"
   - [ ] Success message displays (e.g., "Adjusted to be gentler!")

4. **Tone Adjustment - Shorter**
   - [ ] Type: "I know you've been managing the kids' schedule well, but I wanted to discuss whether we could shift the Thursday pickup time..."
   - [ ] Click "✂️ Make Shorter"
   - [ ] Verify text is condensed to 1-2 sentences
   - [ ] Original meaning preserved (not just truncated)
   - [ ] Success message shows

5. **Tone Adjustment - Warmer**
   - [ ] Type: "We need to discuss the weekend schedule."
   - [ ] Click "💙 Make Warmer"
   - [ ] Verify text becomes more collaborative
   - [ ] Expected: "I'd love to discuss the weekend schedule with you to make sure it works for everyone."
   - [ ] Success message shows

6. **Chained Adjustments**
   - [ ] Make Gentler → Make Shorter → Make Warmer in sequence
   - [ ] Each adjustment is applied to the current draft (not the original)
   - [ ] User can see progressive changes
   - [ ] Success messages appear for each adjustment

### Error Handling

- [ ] Try adjusting with extremely long text (>2000 chars): Should error gracefully
- [ ] If API fails during adjustment: Error message displays, draft **not** cleared
- [ ] User can retry adjustment after error

### Automated Tests

- [ ] Unit test: `adjustSuggestionTone` validates adjustment type
- [ ] Unit test: `adjustSuggestionTone` rejects empty text
- [ ] Unit test: `adjustSuggestionTone` respects max 2000 char limit
- [ ] E2E test: Adjust tone happy path (all 3 tone types)

---

## 3. Dismiss Warning

### Manual Test Steps

1. **Warning Display**
   - [ ] Warnings Panel visible in right column (lg:col-span-4)
   - [ ] Shows top 3 active warnings
   - [ ] Each warning displays category, severity badge, description, timestamp
   - [ ] Severity colors: red (high), amber (medium), slate (low)

2. **Warning Card Interaction**
   - [ ] Hover over warning card; no visual changes expected (dismissal UI always visible)
   - [ ] Each warning shows "Dismiss Warning" button at bottom
   - [ ] Checkbox visible: "Send acknowledgment to other parent"
   - [ ] Checkbox is **unchecked** by default

3. **Simple Dismissal (No Acknowledgment)**
   - [ ] Uncheck "Send acknowledgment" if checked
   - [ ] Click "Dismiss Warning" button
   - [ ] Button shows "Dismissing..." and becomes disabled
   - [ ] Wait 1-2 seconds for backend response
   - [ ] Button returns to normal state
   - [ ] Success message appears (e.g., "Warning dismissed")
   - [ ] Warning card **removed** from display
   - [ ] If warnings > 3, "View All X Alerts" link updates count

4. **Dismissal with Acknowledgment**
   - [ ] Click "Send acknowledgment to other parent" checkbox to enable
   - [ ] Click "Dismiss Warning" button
   - [ ] Button shows "Dismissing..." and is disabled
   - [ ] API is called with `sendAck: true` parameter
   - [ ] Wait for response
   - [ ] Success message appears
   - [ ] Warning card removed

5. **Error Handling**
   - [ ] Simulate API error (network tab → throttle)
   - [ ] Click "Dismiss Warning"
   - [ ] Error message displays (e.g., "Failed to dismiss warning")
   - [ ] Warning card **remains** for user to retry
   - [ ] Button re-enables after error

6. **Multiple Dismissals**
   - [ ] Dismiss 2-3 warnings in sequence
   - [ ] Verify each is removed from the panel
   - [ ] If all dismissed, panel shows "No active warnings. Communication is healthy."

### Automated Tests

- [ ] Unit test: `dismissWarning` checks family/warning ownership
- [ ] Unit test: `dismissWarning` marks warning as dismissed in DB
- [ ] E2E test: Dismiss warning without acknowledgment
- [ ] E2E test: Dismiss warning with acknowledgment

---

## 4. Warning History Page

### Manual Test Steps

1. **Navigation**
   - [ ] Click "Warning Log" in sidebar
   - [ ] URL changes to `/mediation/warnings`
   - [ ] Page title: "Warning History" or similar
   - [ ] Sidebar "Warning Log" link is highlighted as active

2. **Dismissed Warnings Display**
   - [ ] Page shows list of dismissed warnings
   - [ ] Each warning shows: category, severity, description, dismissal date
   - [ ] Warnings sorted by most recent first (descending dismissal date)

3. **Filter by Date Range**
   - [ ] Dropdown or buttons for date range: "Last 7 days", "Last 30 days", "All"
   - [ ] Click "Last 7 days": List updates to show only recent dismissals
   - [ ] Click "Last 30 days": List expands appropriately
   - [ ] Verify URL param updates (e.g., `?days=30`)

4. **Filter by Severity**
   - [ ] Dropdown or checkbox group for severity: "High", "Medium", "Low"
   - [ ] Select "High" only: List shows only high-severity warnings
   - [ ] Select multiple severities: List combines them
   - [ ] Clear filters: List resets to all
   - [ ] Verify URL param updates (e.g., `?severity=high,medium`)

5. **Filter by Category**
   - [ ] Dropdown or search for warning categories
   - [ ] Select "Emotional Intensity": List filters by that category
   - [ ] Combine category + severity filter
   - [ ] Verify combinations work correctly

6. **Empty State**
   - [ ] If no warnings match filters, show "No warnings found for selected filters"
   - [ ] Offer to "Clear filters" button

### Automated Tests

- [ ] Unit test: Filters correctly parse date ranges
- [ ] Unit test: Severity/category filter logic works
- [ ] E2E test: Navigate to warnings page and verify dismissed warnings display
- [ ] E2E test: Apply filters and verify results

---

## 5. De-escalation Tips

### Manual Test Steps

1. **Health Overview Card**
   - [ ] Go to `/mediation` main page
   - [ ] Scroll down to "Communication Health Overview" section
   - [ ] Below "Conflict Frequency (Last 7 Days)" chart, see "Suggested Actions" heading

2. **Tips Display**
   - [ ] Tips section shows 3-5 bullet points with practical advice
   - [ ] Each tip starts with a bullet (•) in primary color
   - [ ] Tips are actionable and child-focused (examples: "Keep messages short", "Use I statements", etc.)
   - [ ] Tips are displayed in normal (non-bold) text

3. **Loading State**
   - [ ] Page initially loads; tips section shows placeholder skeletons (3 gray bars)
   - [ ] After 1-2 seconds, tips populate (no jump/flicker if possible)

4. **Error Handling**
   - [ ] If tips API fails, show "Could not load tips at this time"
   - [ ] No crash or broken layout

5. **Dynamic Tips**
   - [ ] Close browser DevTools; refresh page multiple times
   - [ ] Tips should remain consistent (cached or from same message set)
   - [ ] If you add new messages and refresh, tips may update based on newer message context

### Automated Tests

- [ ] Unit test: `getDeescalationTips` retrieves tips from AI provider
- [ ] Unit test: Fallback tips are used if API fails
- [ ] Unit test: Tips are limited to 3-5 items
- [ ] E2E test: Navigate to mediation page, verify tips section loads and displays

---

## 6. Toast Notifications

### Manual Test Steps

1. **Toast Component Integration**
   - [ ] Verify `ToastProvider` wraps the mediation page (or root layout)
   - [ ] Toast notifications appear in bottom-right corner of page

2. **Success Toast**
   - [ ] Send a suggestion successfully
   - [ ] Green success toast appears with checkmark icon and "Suggestion sent successfully!" message
   - [ ] Toast auto-dismisses after 3 seconds

3. **Error Toast**
   - [ ] Attempt to send with empty text or trigger an error
   - [ ] Red error toast appears with error icon
   - [ ] Toast displays specific error message
   - [ ] User can manually close toast via X button
   - [ ] Toast auto-dismisses after 3-5 seconds

4. **Info Toast**
   - [ ] If any info notifications are triggered, blue info toast appears
   - [ ] Icon is info symbol
   - [ ] Behavior similar to success/error toasts

5. **Multiple Toasts**
   - [ ] Perform multiple actions in quick succession (e.g., adjust tone 3x)
   - [ ] Multiple toasts stack vertically with 8px gap
   - [ ] Each toast has independent auto-dismiss timer

### Automated Tests

- [ ] Unit test: `useToast` hook adds toast to context
- [ ] Unit test: Toast auto-dismisses after duration
- [ ] Unit test: Manual close (X button) removes toast
- [ ] E2E test: Trigger success toast via send action
- [ ] E2E test: Trigger error toast via failed action

---

## 7. Error Handling & Edge Cases

### Network & API Errors

- [ ] **Send Suggestion Fails**
  - [ ] Backend returns 400 (validation error): Error message shown, draft preserved
  - [ ] Backend returns 401 (auth): Redirect to login
  - [ ] Backend returns 500 (server error): Friendly error message shown

- [ ] **Adjust Tone Fails**
  - [ ] Claude API timeout: Fallback to original text, error message
  - [ ] Network error: Error toast shows, user can retry

- [ ] **Dismiss Warning Fails**
  - [ ] API returns 404 (warning not found): Error message shown
  - [ ] API returns 403 (access denied): Error message shown

### Validation

- [ ] **Text Length**
  - [ ] Send with 1 character: Succeeds
  - [ ] Send with 2000 characters: Succeeds
  - [ ] Send with 2001 characters: Fails with "must be under 2,000 characters"
  - [ ] Send with only whitespace: Fails with "cannot be empty"

- [ ] **Auth & Scoping**
  - [ ] Parent A creates suggestion, Parent B cannot see it on their page
  - [ ] Parent A cannot dismiss warnings from Parent B's family

### Performance

- [ ] **Large Message Sets**
  - [ ] Family with 500+ messages loads tips without hanging
  - [ ] Tips load in < 3 seconds

- [ ] **Rapid Interactions**
  - [ ] Spam "Adjust Tone" button 5 times quickly
  - [ ] Requests are not duplicated; loading state prevents double-submission

---

## 8. Cross-Browser & Responsive Testing

### Browsers

- [ ] **Chrome (Desktop)**: All features work, no console errors
- [ ] **Safari (Desktop)**: All features work, check for any CSS quirks
- [ ] **Firefox (Desktop)**: All features work
- [ ] **Mobile Chrome**: Responsive layout, buttons/inputs are touch-friendly

### Responsive Breakpoints

- [ ] **Mobile (< 640px)**: Layout stacks correctly, no horizontal scroll
- [ ] **Tablet (640px - 1024px)**: Sidebar hidden or collapsible, content adjusts
- [ ] **Desktop (> 1024px)**: Sidebar visible, 3-column layout (sidebar + health + warnings)

---

## 9. Accessibility Testing

- [ ] **Keyboard Navigation**
  - [ ] Tab through all interactive elements (buttons, inputs, links)
  - [ ] Tab order is logical (top-to-bottom, left-to-right)
  - [ ] Enter/Space activates buttons

- [ ] **Screen Reader (NVDA or JAWS)**
  - [ ] Buttons have accessible names (aria-label if needed)
  - [ ] Form labels are associated with inputs
  - [ ] Error messages are announced
  - [ ] Toast notifications are announced (or marked `role="alert"`)

- [ ] **Color Contrast**
  - [ ] All text meets WCAG AA (4.5:1 for normal text, 3:1 for large text)
  - [ ] Use browser DevTools or axe to check

---

## 10. Monitoring & Observability

### Logs to Check

- [ ] **Info events**
  - [ ] `mediation.suggestion_sent`: Verify event is logged with topicId, messageId
  - [ ] `mediation.suggestion_adjusted`: Verify adjustment type and lengths are logged
  - [ ] `mediation.warning_dismissed`: Verify warningId and sendAck flag are logged
  - [ ] `mediation.deescalation_tips_retrieved`: Verify tips count and message analysis are logged

- [ ] **Error events**
  - [ ] `mediation.suggestion_send_failed`: Check error message is non-PII and descriptive
  - [ ] `mediation.suggestion_adjustment_failed`: Verify error handling
  - [ ] `mediation.deescalation_tips_failed`: Verify fallback is used

### Observability Metrics

- [ ] No 5xx errors in logs related to mediation
- [ ] API response times < 2 seconds for send/dismiss
- [ ] Tone adjustment API response times < 5 seconds (may be slower due to Claude)

---

## 11. Post-Deployment Checklist

- [ ] All new components deploy without errors
- [ ] Database migrations applied (if any)
- [ ] Environment variables set (Claude API keys, etc.)
- [ ] Feature flags configured (if applicable)
- [ ] Monitoring alerts configured for new API routes
- [ ] Documentation updated in DEPLOYMENT.md

---

## Sign-Off

- **QA Tester**: __________________ **Date**: __________
- **Product Manager**: __________ **Date**: __________
- **Engineering Lead**: __________ **Date**: __________

---

## Notes for Developers

- Run `pnpm lint` and `npx tsc --noEmit` before committing
- Run `pnpm test` to execute Jest unit tests
- Run `pnpm e2e` to execute Playwright end-to-end tests
- Keep logs structured; use `logEvent` from `@/lib/observability/logger`
- Never log PII; use `redactPIIForClaude` for API inputs
