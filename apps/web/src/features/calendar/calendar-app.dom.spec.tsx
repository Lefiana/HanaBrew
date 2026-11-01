import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { calendarEvent, installFakeApi, newDb, renderWithQuery } from "@/test/fake-api";
import { toDateKey, zonedDateKey, zonedParts, zonedWallTimeToInstant } from "@/lib/tz";
import { CalendarApp } from "./calendar-app";

const ZONE = "Asia/Manila";
const todayKey = () => zonedDateKey(new Date(), ZONE);
const at = (hour: number, minute = 0) => {
  const p = zonedParts(new Date(), ZONE);
  return zonedWallTimeToInstant(
    { year: p.year, month: p.month, day: p.day, hour, minute },
    ZONE,
  ).toISOString();
};

describe("CalendarApp", () => {
  it("shows today's event in the month view, and in the week view's time grid", async () => {
    installFakeApi(
      newDb({
        events: [calendarEvent({ title: "Standup", start: at(9), end: at(9, 30), timeZone: ZONE })],
      }),
    );
    const user = userEvent.setup();
    renderWithQuery(<CalendarApp />);

    expect(await screen.findByRole("button", { name: /Standup/ })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Week" }));
    expect(await screen.findByTitle(/^Standup, /)).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Day" }));
    expect(await screen.findByTitle(/^Standup, /)).toBeInTheDocument();
  });

  it("shows an all-day event as a chip", async () => {
    const start = `${todayKey()}T00:00:00.000Z`;
    const end = `${new Date(Date.parse(start) + 86_400_000).toISOString()}`;
    installFakeApi(
      newDb({ events: [calendarEvent({ title: "Holiday", allDay: true, start, end })] }),
    );
    renderWithQuery(<CalendarApp />);
    expect(await screen.findByRole("button", { name: /Holiday/ })).toBeInTheDocument();
  });

  it("creates a timed event with exact instants in the user's zone", async () => {
    const db = newDb();
    installFakeApi(db);
    const user = userEvent.setup();
    renderWithQuery(<CalendarApp />);

    await user.click(await screen.findByRole("button", { name: /Event/ }));
    await user.type(await screen.findByLabelText("Title"), "Dentist");
    await user.click(screen.getByRole("button", { name: "Add event" }));

    await waitFor(() => expect(db.writes).toHaveLength(1));
    expect(db.writes[0]).toMatchObject({
      method: "POST",
      path: "/api/calendar-events",
      body: { title: "Dentist", allDay: false, start: at(9), end: at(10), timeZone: ZONE },
    });
    expect(await screen.findByRole("tab", { name: "Month" })).toBeInTheDocument(); // back on the calendar
  });

  it("creates an all-day event as floating dates (end exclusive)", async () => {
    const db = newDb();
    installFakeApi(db);
    const user = userEvent.setup();
    renderWithQuery(<CalendarApp />);

    await user.click(await screen.findByRole("button", { name: /Event/ }));
    await user.type(await screen.findByLabelText("Title"), "Trip");
    await user.click(screen.getByLabelText("All-day"));
    await user.click(screen.getByRole("button", { name: "Add event" }));

    await waitFor(() => expect(db.writes).toHaveLength(1));
    const key = todayKey();
    const next = toDateKey({
      year: Number(key.slice(0, 4)),
      month: Number(key.slice(5, 7)),
      day: Number(key.slice(8)) + 1,
    });
    expect(db.writes[0]!.body).toMatchObject({ allDay: true, start: `${key}T00:00:00.000Z` });
    expect(
      new Date(String(db.writes[0]!.body!.end)).getTime() -
        new Date(`${key}T00:00:00.000Z`).getTime(),
    ).toBe(86_400_000);
    expect(next.length).toBe(10);
  });

  it("blocks an event that ends before it starts, without calling the API", async () => {
    const db = newDb();
    installFakeApi(db);
    const user = userEvent.setup();
    renderWithQuery(<CalendarApp />);

    await user.click(await screen.findByRole("button", { name: /Event/ }));
    await user.type(await screen.findByLabelText("Title"), "Backwards");
    const endTime = screen.getByLabelText("End time");
    await user.clear(endTime);
    await user.type(endTime, "08:00");
    await user.click(screen.getByRole("button", { name: "Add event" }));

    expect(await screen.findByText(/must end after it starts/)).toBeInTheDocument();
    expect(db.writes).toHaveLength(0);
  });

  it("navigates months", async () => {
    installFakeApi(newDb());
    const user = userEvent.setup();
    renderWithQuery(<CalendarApp />);
    const heading = await screen.findByRole("heading", { level: 2 });
    const before = heading.textContent;
    await user.click(screen.getByRole("button", { name: "Next month" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2 }).textContent).not.toBe(before),
    );
    await user.click(screen.getByRole("button", { name: "Today" }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(before));
    expect(
      within(screen.getByRole("tablist", { name: "Calendar view" })).getAllByRole("tab"),
    ).toHaveLength(3);
  });
});
