import React from 'react';
import { render, screen } from '@testing-library/react';
import type { CalendarDayState } from '@/lib/calendar-engine';
import { CalendarDayCell } from '@/components/calendar-day-cell';

// Test helpers
function createMockDay(overrides?: Partial<CalendarDayState>): CalendarDayState {
  return {
    dateStr: "2024-03-15",
    dayOfMonth: 15,
    custodyParent: { id: "parent-1", name: "Parent 1" } as any,
    custodyColor: "primary",
    events: [],
    hasPendingRequest: false,
    ...overrides,
  };
}

describe("CalendarDayCell", () => {
  describe("custody color rendering", () => {
    it("renders with primary custody color", () => {
      const day = createMockDay({ custodyColor: "primary" });
      const { container } = render(
        <CalendarDayCell day={day} isToday={false} isPrevMonth={false} />
      );

      const custodyBackground = container.querySelector("div[class*='bg-primary/10']");
      expect(custodyBackground).toBeInTheDocument();
      expect(custodyBackground).toHaveClass("absolute", "inset-0", "rounded-xl", "pointer-events-none");
    });

    it("renders with secondary custody color", () => {
      const day = createMockDay({ custodyColor: "secondary" });
      const { container } = render(
        <CalendarDayCell day={day} isToday={false} isPrevMonth={false} />,
      );

      const custodyBackground = container.querySelector("div[class*='bg-secondary/10']");
      expect(custodyBackground).toBeInTheDocument();
    });

    it("renders with split custody color", () => {
      const day = createMockDay({ custodyColor: "split" });
      const { container } = render(
        <CalendarDayCell day={day} isToday={false} isPrevMonth={false} />
      );

      const flexContainer = container.querySelector("div[class*='flex'][class*='absolute']");
      expect(flexContainer).toBeInTheDocument();
      expect(flexContainer).toHaveClass("absolute", "inset-0", "rounded-xl", "overflow-hidden", "pointer-events-none", "flex");

      const children = flexContainer?.querySelectorAll("div");
      expect(children).toHaveLength(2);
      expect(children?.[0]).toHaveClass("w-1/2", "h-full", "bg-secondary/10");
      expect(children?.[1]).toHaveClass("w-1/2", "h-full", "bg-primary/10");
    });
  });

  describe("day number rendering", () => {
    it("shows day number", () => {
      const day = createMockDay({ dayOfMonth: 15 });
      render(<CalendarDayCell day={day} isToday={false} isPrevMonth={false} />);
      expect(screen.getByText("15")).toBeInTheDocument();
    });

    it("highlights today with special styling", () => {
      const day = createMockDay({ dayOfMonth: 15 });
      const { container } = render(
        <CalendarDayCell day={day} isToday={true} isPrevMonth={false} />
      );

      const todaySpan = container.querySelector("span.bg-primary.text-white");
      expect(todaySpan).toBeInTheDocument();
      expect(todaySpan).toHaveClass("flex", "items-center", "justify-center", "w-7", "h-7", "bg-primary", "text-white", "rounded-full", "font-bold", "text-sm", "shadow-sm");
      expect(todaySpan).toHaveTextContent("15");
    });
  });

  describe("previous month padding", () => {
    it("renders grayed-out for previous month days", () => {
      const day = createMockDay({ dayOfMonth: 28 });
      const { container } = render(
        <CalendarDayCell day={day} isToday={false} isPrevMonth={true} />
      );

      const prevMonthContainer = container.querySelector("div.bg-slate-50");
      expect(prevMonthContainer).toBeInTheDocument();
      expect(prevMonthContainer).toHaveClass("bg-slate-50", "dark:bg-slate-800/50", "rounded-xl", "p-3", "opacity-40", "min-h-[120px]", "border", "border-transparent");
      expect(prevMonthContainer).toHaveTextContent("28");
    });
  });

  describe("pending request indicator", () => {
    it("shows pending request styling when hasPendingRequest is true", () => {
      const day = createMockDay({ hasPendingRequest: true });
      const { container } = render(
        <CalendarDayCell day={day} isToday={false} isPrevMonth={false} />
      );

      const mainContainer = container.querySelector("[class*='ring-amber-300']");
      expect(mainContainer).toBeInTheDocument();
      expect(mainContainer).toHaveClass("ring-2", "ring-amber-300");

      const pendingIcon = container.querySelector("span.text-amber-500");
      expect(pendingIcon).toBeInTheDocument();
      expect(pendingIcon).toHaveTextContent("pending");
    });
  });
});
