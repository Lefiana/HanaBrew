"use client";

import {
  allDayToInstants,
  instantsToAllDayDates,
  validateEventTimes,
  type CalendarEvent,
} from "@hanabrew/contracts";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { errorMessageOf, fieldErrorsOf } from "@/lib/api-client";
import { toDateKey, zonedParts, zonedWallTimeToInstant } from "@/lib/tz";
import { useEventMutations } from "./use-events";

const CATEGORY_SUGGESTIONS = ["work", "personal", "focus", "social", "health"];
const pad = (n: number) => String(n).padStart(2, "0");

function wallOf(instant: Date, timeZone: string) {
  const p = zonedParts(instant, timeZone);
  return { date: toDateKey(p), time: `${pad(p.hour)}:${pad(p.minute)}` };
}

function instantOf(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const [hour, minute] = time.split(":").map(Number) as [number, number];
  return zonedWallTimeToInstant({ year, month, day, hour, minute }, timeZone);
}

interface EventFormProps {
  event?: CalendarEvent | undefined;
  defaultDate: string;
  /** Hour (0-23) to pre-fill, e.g. from clicking a slot in the week view. */
  defaultHour?: number | undefined;
  timeZone: string;
  onDone: () => void;
}

export function EventForm({ event, defaultDate, defaultHour, timeZone, onDone }: EventFormProps) {
  const { create, update, remove } = useEventMutations();

  const initial = (() => {
    if (event?.allDay) {
      const { startDate, endDate } = instantsToAllDayDates(event.start, event.end);
      return { startDate, startTime: "09:00", endDate, endTime: "10:00" };
    }
    if (event) {
      const s = wallOf(new Date(event.start), timeZone);
      const e = wallOf(new Date(event.end), timeZone);
      return { startDate: s.date, startTime: s.time, endDate: e.date, endTime: e.time };
    }
    const start = instantOf(defaultDate, `${pad(defaultHour ?? 9)}:00`, timeZone);
    const end = wallOf(new Date(start.getTime() + 3_600_000), timeZone);
    return {
      startDate: defaultDate,
      startTime: `${pad(defaultHour ?? 9)}:00`,
      endDate: end.date,
      endTime: end.time,
    };
  })();

  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [category, setCategory] = useState(event?.category ?? "");
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [startTime, setStartTime] = useState(initial.startTime);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [endTime, setEndTime] = useState(initial.endTime);
  const [error, setError] = useState<unknown>(null);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const busy = create.isPending || update.isPending || remove.isPending;
  const fields = fieldErrorsOf(error);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setTimeError(null);
    if (!startDate || !endDate || (!allDay && (!startTime || !endTime))) {
      setTimeError("Choose a start and an end.");
      return;
    }
    const times = allDay
      ? allDayToInstants(startDate, endDate)
      : {
          start: instantOf(startDate, startTime, timeZone).toISOString(),
          end: instantOf(endDate, endTime, timeZone).toISOString(),
        };
    const problem = validateEventTimes({ allDay, ...times });
    if (problem) {
      setTimeError(problem);
      return;
    }
    const body = {
      title,
      description: description.trim() ? description : null,
      category: category.trim() ? category.trim() : null,
      allDay,
      ...times,
      timeZone,
    };
    try {
      if (event) await update.mutateAsync({ id: event.id, patch: body });
      else await create.mutateAsync(body);
      onDone();
    } catch (err) {
      setError(err);
    }
  }

  async function onDelete() {
    if (!event) return;
    try {
      await remove.mutateAsync(event.id);
      onDone();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 p-4" noValidate>
      <h2 className="text-lg font-semibold">{event ? "Edit event" : "New event"}</h2>
      <Field id="event-title" label="Title" error={fields.title}>
        <Input
          id="event-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          autoFocus
          required
        />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={allDay}
          onChange={(e) => setAllDay(e.target.checked)}
          className="size-4 accent-[var(--hb-ring)]"
        />
        All-day
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="event-start-date" label={allDay ? "First day" : "Starts"}>
          <div className="flex gap-2">
            <Input
              id="event-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            {!allDay && (
              <Input
                aria-label="Start time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-32"
              />
            )}
          </div>
        </Field>
        <Field
          id="event-end-date"
          label={allDay ? "Last day" : "Ends"}
          error={timeError ?? fields.end}
        >
          <div className="flex gap-2">
            <Input
              id="event-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
            {!allDay && (
              <Input
                aria-label="End time"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-32"
              />
            )}
          </div>
        </Field>
      </div>
      <p className="-mt-2 text-xs text-muted">
        {allDay
          ? "All-day events stay on the same dates in every time zone."
          : `Times are in ${timeZone.replace(/_/g, " ")}.`}
      </p>

      <Field id="event-category" label="Category" error={fields.category}>
        <Input
          id="event-category"
          list="event-categories"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          maxLength={30}
          placeholder="Optional"
        />
        <datalist id="event-categories">
          {CATEGORY_SUGGESTIONS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <Field id="event-desc" label="Description" error={fields.description}>
        <Textarea
          id="event-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      {error != null && Object.keys(fields).length === 0 && (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {errorMessageOf(error)}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={busy}>
          {event ? "Save changes" : "Add event"}
        </Button>
        <Button type="button" variant="outline" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        {event && (
          <span className="ml-auto flex items-center gap-2">
            {confirmDelete ? (
              <>
                <span className="text-sm text-muted">Delete this event?</span>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => void onDelete()}
                  disabled={busy}
                >
                  Yes, delete
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                >
                  Keep
                </Button>
              </>
            ) : (
              <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            )}
          </span>
        )}
      </div>
    </form>
  );
}
