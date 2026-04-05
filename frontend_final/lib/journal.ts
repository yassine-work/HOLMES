import { CurrentJobStatus, VerificationStatus } from "@/lib/api";

export type JournalEntry = {
  jobId: string;
  currentStatus: CurrentJobStatus;
  verdictStatus: VerificationStatus;
  updatedAt: string;
};

const JOURNAL_KEY = "holmes-detective-journal";
export const JOURNAL_UPDATE_EVENT = "holmes-journal-updated";

function canUseStorage(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function parseJournal(raw: string | null): JournalEntry[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => {
        const candidate = entry as Partial<JournalEntry>;
        if (
          typeof candidate.jobId !== "string" ||
          typeof candidate.currentStatus !== "string" ||
          typeof candidate.updatedAt !== "string"
        ) {
          return null;
        }

        return {
          jobId: candidate.jobId,
          currentStatus: candidate.currentStatus as CurrentJobStatus,
          verdictStatus: (candidate.verdictStatus ??
            null) as VerificationStatus,
          updatedAt: candidate.updatedAt,
        };
      })
      .filter((entry): entry is JournalEntry => entry !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

function writeJournal(entries: JournalEntry[]): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(JOURNAL_KEY, JSON.stringify(entries));
  window.dispatchEvent(new Event(JOURNAL_UPDATE_EVENT));
}

export function getRecentJournalEntries(limit = 3): JournalEntry[] {
  if (!canUseStorage()) {
    return [];
  }

  return parseJournal(window.localStorage.getItem(JOURNAL_KEY)).slice(0, limit);
}

export function upsertJournalEntry(
  entry: Omit<JournalEntry, "updatedAt">,
): void {
  if (!canUseStorage()) {
    return;
  }

  const now = new Date().toISOString();
  const current = parseJournal(window.localStorage.getItem(JOURNAL_KEY));
  const withoutCurrent = current.filter(
    (journalEntry) => journalEntry.jobId !== entry.jobId,
  );

  const next: JournalEntry[] = [
    {
      ...entry,
      updatedAt: now,
    },
    ...withoutCurrent,
  ].slice(0, 20);

  writeJournal(next);
}
