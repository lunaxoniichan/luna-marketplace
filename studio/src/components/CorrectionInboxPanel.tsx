"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  vaultCorrectionCandidates,
  vaultCorrectionAccept,
  vaultCorrectionReject,
} from "@/app/actions/vault";

type Candidate = {
  candidate_id: string;
  what_claude_did: string;
  what_user_said: string;
  implied_preference: string;
  date: string;
  source: string;
  duplicate: boolean;
};

type ListResult = {
  ok: boolean;
  candidates?: Candidate[];
  sources?: { pending_file: string; pending_count: number; lessons_present: boolean };
  error?: { message: string };
};

/**
 * Correction inbox — human review of candidate lessons.
 * Accept appends ONE line to lessons.md + lessons.mdc via the protected append helper.
 * No auto-merge, no memory writes, no cross-vault writes.
 */
export function CorrectionInboxPanel({ vaultId }: { vaultId: string }) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [sources, setSources] = useState<ListResult["sources"] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(() => {
    setErr(null);
    setMsg(null);
    startTransition(async () => {
      const r = (await vaultCorrectionCandidates({ vaultId })) as ListResult;
      if (!r.ok) {
        setErr(r.error?.message || "inbox failed");
        setCandidates([]);
        return;
      }
      setCandidates(r.candidates ?? []);
      setSources(r.sources ?? null);
      setMsg(
        (r.candidates?.length ?? 0) > 0
          ? `${r.candidates!.length} candidate(s) awaiting review`
          : "No pending corrections. New captures arrive from the lessons-extractor hook.",
      );
    });
  }, [vaultId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const accept = (c: Candidate) => {
    setErr(null);
    startTransition(async () => {
      const r = (await vaultCorrectionAccept({
        vaultId,
        candidateId: c.candidate_id,
        what_claude_did: c.what_claude_did,
        implied_preference: c.implied_preference,
        applies_to: "this_project",
      })) as { ok: boolean; appended?: boolean; deduped?: boolean; error?: { message: string } };
      if (!r.ok) {
        setErr(r.error?.message || "accept failed");
        return;
      }
      setDismissed((prev) => new Set(prev).add(c.candidate_id));
      setMsg(
        r.deduped
          ? "Already covered by an existing lesson — nothing appended."
          : "Appended to lessons.md + lessons.mdc. Run Regenerate views to refresh generated rules.",
      );
    });
  };

  const reject = (c: Candidate) => {
    startTransition(async () => {
      await vaultCorrectionReject({ vaultId, candidateId: c.candidate_id });
      setDismissed((prev) => new Set(prev).add(c.candidate_id));
    });
  };

  const visible = candidates.filter((c) => !dismissed.has(c.candidate_id));

  return (
    <div className="space-y-4">
      <p className="rounded border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">
        <strong className="text-slate-300">Correction inbox</strong> — accept appends one lesson line
        to <code>.claude/rules/lessons.md</code> + <code>.cursor/rules/lessons.mdc</code> only. No
        auto-merge, no memory writes. Reject dismisses without writing.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded border border-slate-600 px-3 py-1 text-sm text-slate-300 disabled:opacity-50"
          onClick={refresh}
          disabled={pending}
        >
          Refresh
        </button>
        {sources && (
          <span className="text-xs text-slate-500">
            source: {sources.pending_count} pending ·{" "}
            {sources.lessons_present ? "lessons.md present" : "no lessons.md yet"}
          </span>
        )}
      </div>

      {msg && <p className="text-sm text-emerald-300">{msg}</p>}
      {err && <p className="text-sm text-red-300">{err}</p>}

      <ul className="space-y-2">
        {visible.map((c) => (
          <li key={c.candidate_id} className="rounded border border-slate-800 px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] text-slate-500">
                {c.date} · {c.source}
              </span>
              {c.duplicate && (
                <span className="text-[10px] text-amber-300">already covered — will dedup</span>
              )}
            </div>
            <p className="mt-1 text-slate-300">
              <span className="text-slate-500">AVOID</span> {c.what_claude_did}
            </p>
            <p className="text-slate-300">
              <span className="text-slate-500">DO</span> {c.implied_preference}
            </p>
            {c.what_user_said && (
              <p className="mt-1 text-xs text-slate-500">why: {c.what_user_said}</p>
            )}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="rounded border border-emerald-700 px-2 py-1 text-xs text-emerald-300 disabled:opacity-50"
                onClick={() => accept(c)}
                disabled={pending}
              >
                Accept → lessons.md
              </button>
              <button
                type="button"
                className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 disabled:opacity-50"
                onClick={() => reject(c)}
                disabled={pending}
              >
                Reject
              </button>
            </div>
          </li>
        ))}
        {!visible.length && !err && (
          <li className="text-sm text-slate-500">Nothing to review.</li>
        )}
      </ul>
    </div>
  );
}
