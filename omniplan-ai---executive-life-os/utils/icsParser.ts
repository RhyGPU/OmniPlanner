import { CalendarEvent } from '../types';

interface ParsedIcsEvent {
  date: string; // YYYY-MM-DD
  event: CalendarEvent;
}

/**
 * Parse an ICS file string and return calendar events grouped by date.
 * Handles VEVENT blocks with DTSTART, DTEND, SUMMARY, DESCRIPTION.
 */
export const parseIcsFile = (icsText: string): ParsedIcsEvent[] => {
  const events: ParsedIcsEvent[] = [];
  // Unfold long lines per RFC 5545 (lines split with CRLF + whitespace)
  const unfolded = icsText.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);

  let inEvent = false;
  let summary = '';
  let description = '';
  let dtStart = '';
  let dtEnd = '';

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      summary = '';
      description = '';
      dtStart = '';
      dtEnd = '';
      continue;
    }

    if (line === 'END:VEVENT') {
      if (inEvent && dtStart) {
        const parsed = parseDtValue(dtStart);
        if (parsed) {
          const endParsed = dtEnd ? parseDtValue(dtEnd) : null;
          const startHour = parsed.hour + parsed.minute / 60;
          let duration = 1; // default 1 hour

          if (endParsed) {
            // If same day, compute duration
            if (endParsed.date === parsed.date) {
              const endHour = endParsed.hour + endParsed.minute / 60;
              duration = Math.max(0.5, endHour - startHour);
            } else {
              duration = 1; // multi-day events default to 1hr block
            }
          }

          events.push({
            date: parsed.date,
            event: {
              id: `ics-${Date.now()}-${events.length}`,
              title: summary || 'Imported Event',
              description: description || undefined,
              startHour: Math.max(0, Math.min(23.5, startHour)),
              duration: Math.min(duration, 24 - startHour),
              color: 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm',
              repeating: false,
            },
          });
        }
      }
      inEvent = false;
      continue;
    }

    if (!inEvent) continue;

    if (line.startsWith('SUMMARY:')) {
      summary = line.substring(8);
    } else if (line.startsWith('DESCRIPTION:')) {
      description = line.substring(12).replace(/\\n/g, '\n').replace(/\\,/g, ',');
    } else if (line.startsWith('DTSTART')) {
      dtStart = extractDtValue(line);
    } else if (line.startsWith('DTEND')) {
      dtEnd = extractDtValue(line);
    }
  }

  return events;
};

/**
 * Extract the value part from a DTSTART/DTEND line, handling parameters.
 * e.g. "DTSTART;TZID=America/New_York:20240315T140000" → "20240315T140000"
 *      "DTSTART:20240315T140000Z" → "20240315T140000Z"
 *      "DTSTART;VALUE=DATE:20240315" → "20240315"
 */
const extractDtValue = (line: string): string => {
  const colonIdx = line.indexOf(':');
  return colonIdx > -1 ? line.substring(colonIdx + 1).trim() : '';
};

/**
 * Parse a DTSTART/DTEND value into date + time components.
 * Supports: 20240315T140000, 20240315T140000Z, 20240315 (all-day)
 */
const parseDtValue = (value: string): { date: string; hour: number; minute: number } | null => {
  // All-day event: YYYYMMDD
  const dateOnly = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    return {
      date: `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`,
      hour: 9, // Default to 9 AM for all-day events
      minute: 0,
    };
  }

  // Date-time: YYYYMMDDTHHmmss or YYYYMMDDTHHmmssZ
  const dateTime = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (dateTime) {
    return {
      date: `${dateTime[1]}-${dateTime[2]}-${dateTime[3]}`,
      hour: parseInt(dateTime[4], 10),
      minute: parseInt(dateTime[5], 10),
    };
  }

  return null;
};
