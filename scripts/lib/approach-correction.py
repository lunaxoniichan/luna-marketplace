#!/usr/bin/env python3
"""Approach-correction extractor (Luna Agent Kit, pain #1 — active capture).

Reads the current session's transcript JSONL, finds moments where the USER
pushed back on Claude's chosen approach, and records them so future sessions
don't repeat the mistake:

  * high-confidence (any scope)  -> append a one-line lesson to
        .claude/rules/lessons.md  (+ mirror .cursor/rules/lessons.mdc)
    and a native `feedback` memory under ~/.claude/projects/<slug>/memory/.
    Portable (`all_projects`) lessons are tagged `[portable]` in lessons.md only —
    the kit never writes ~/.claude/CLAUDE.md or other user-level files.
  * medium-confidence              -> .pending-feedback.md (awaiting review).
  * low / unknown                  -> dropped.

Runs DETACHED from SessionEnd (the bash wrapper backgrounds it), so it never
blocks the user. One Haiku call per session of >= MIN_USER_MESSAGES messages.
Privacy: transcript stays local; only the structured extractor prompt is sent.

Opt-out: LUNA_LESSONS_AUTOEXTRACT=off, or a .claude/.no-reflect marker file.
Adapted from flynance _lib/approach_correction.py.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

PROJECT_DIR = Path(os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd())
PROJECT_SLUG = "-" + str(PROJECT_DIR).strip("/").replace("/", "-")
MEMORY_DIR = Path(os.path.expanduser("~/.claude/projects")) / PROJECT_SLUG / "memory"
PENDING_FILE = MEMORY_DIR / ".pending-feedback.md"
MEMORY_INDEX = MEMORY_DIR / "MEMORY.md"
NO_REFLECT_MARKER = PROJECT_DIR / ".claude" / ".no-reflect"
LESSONS_MD = PROJECT_DIR / ".claude" / "rules" / "lessons.md"
LESSONS_MDC = PROJECT_DIR / ".cursor" / "rules" / "lessons.mdc"
LOG_FILE = PROJECT_DIR / ".claude" / ".luna-cache" / "lessons-extractor.log"

MIN_USER_MESSAGES = 10
TRANSCRIPT_BUDGET_CHARS = 30_000
EXTRACTOR_MODEL = "haiku"
SIMILARITY_THRESHOLD = 0.55

EXTRACTOR_PROMPT = """\
You are a feedback-extraction agent for a Claude Code session.

I will give you a session transcript. Find moments where the USER pushed back
on Claude's chosen approach (tool choice, workflow, naming, architecture, style).

Return STRICT JSON, no prose, no markdown fences:

{
  "corrections": [
    {
      "what_claude_did": "<one sentence describing claude's chosen approach>",
      "what_user_said": "<verbatim or paraphrased user pushback>",
      "implied_preference": "<one-sentence rule for future sessions>",
      "confidence": "high|medium|low",
      "applies_to": "this_project|all_projects",
      "category": "tool_choice|workflow|naming|architecture|style|other"
    }
  ]
}

RULES:
- Only include corrections where the user EXPLICITLY pushed back.
- Ignore clarifications, acknowledgements, and Claude's own self-corrections.
- confidence=high requires verbatim language like: "don't", "no", "stop",
  "instead", "prefer X over Y", "always do X", "never do Y", "use X not Y".
- confidence=medium: mild preference without "don't/no/stop" ("maybe try X").
- confidence=low: ambiguous. Usually drop.
- applies_to=all_projects: user said "in all my projects"/"everywhere"/"always" — tag as
  [portable] in project lessons.md only; never write user-level ~/.claude/CLAUDE.md.
- If there are NO real corrections, return {"corrections": []}.
- Output ONLY the JSON object.

TRANSCRIPT (most recent turns first if truncated):

"""


def log(msg: str) -> None:
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(f"[{datetime.now(timezone.utc).isoformat(timespec='seconds')}] {msg}\n")
    except Exception:
        pass


def now_date() -> str:
    return datetime.now(timezone.utc).date().isoformat()


# --- transcript loading -------------------------------------------------------

def load_transcript(path: Path) -> tuple[list[dict], int]:
    events: list[dict] = []
    user_count = 0
    try:
        with path.open("r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    msg = json.loads(line)
                except Exception:
                    continue
                events.append(msg)
                if msg.get("type") == "user" or (msg.get("message", {}) or {}).get("role") == "user":
                    user_count += 1
    except Exception as exc:
        log(f"load_transcript failed: {exc}")
        return [], 0
    return events, user_count


def build_compact_transcript(events: list[dict], budget: int = TRANSCRIPT_BUDGET_CHARS) -> str:
    lines: list[str] = []
    for evt in events:
        kind = evt.get("type") or (evt.get("message") or {}).get("role")
        if kind not in ("user", "assistant"):
            continue
        message = evt.get("message") or {}
        content = message.get("content") if isinstance(message, dict) else evt.get("content")
        chunks: list[str] = []
        if isinstance(content, str):
            chunks.append(content)
        elif isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text" and isinstance(block.get("text"), str):
                    chunks.append(block["text"])
                elif isinstance(block, str):
                    chunks.append(block)
        text = "\n".join(chunks).strip()
        if not text:
            continue
        lines.append(f"--- {'USER' if kind == 'user' else 'CLAUDE'} ---\n{text}")
    full = "\n\n".join(lines)
    if len(full) <= budget:
        return full
    truncated = full[-budget:]
    boundary = truncated.find("--- ")
    if boundary > 0:
        truncated = truncated[boundary:]
    return f"[…earlier turns truncated…]\n\n{truncated}"


# --- claude headless ----------------------------------------------------------

def run_extractor(prompt: str) -> dict | None:
    cmd = ["claude", "-p", "--model", EXTRACTOR_MODEL, "--output-format", "json",
           "--no-session-persistence"]
    try:
        proc = subprocess.run(cmd, input=prompt, capture_output=True, text=True, timeout=120)
    except subprocess.TimeoutExpired:
        log("extractor timeout")
        return None
    except FileNotFoundError:
        log("claude CLI not on PATH")
        return None
    except Exception as exc:
        log(f"extractor invocation failed: {type(exc).__name__}: {exc}")
        return None
    if proc.returncode != 0:
        log(f"extractor non-zero exit {proc.returncode}: {proc.stderr[:300]}")
        return None
    raw = proc.stdout.strip()
    if not raw:
        return None
    try:
        outer = json.loads(raw)
        if isinstance(outer, dict) and outer.get("is_error"):
            log(f"extractor inner error: {str(outer.get('result',''))[:200]}")
            return None
        inner = outer.get("result", raw) if isinstance(outer, dict) else raw
    except Exception:
        inner = raw
    if isinstance(inner, dict):
        return inner
    stripped = inner.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*", "", stripped)
        stripped = re.sub(r"\s*```$", "", stripped)
    try:
        return json.loads(stripped)
    except Exception as exc:
        log(f"extractor output not JSON: {exc}")
        return None


# --- writers ------------------------------------------------------------------

def slugify(text: str, max_words: int = 8) -> str:
    words = [w for w in re.sub(r"[^a-z0-9\s]", " ", text.lower()).split() if w]
    return "_".join(words[:max_words]) or "preference"


def keyword_set(text: str) -> set[str]:
    stop = {"the","a","an","of","to","and","or","in","on","for","is","are","be","with",
            "as","by","at","this","that","use","do","not","no","must","should","always","never"}
    return {w for w in re.sub(r"[^a-z0-9\s]", " ", text.lower()).split() if len(w) > 2 and w not in stop}


def find_similar(implied: str) -> Path | None:
    keys = keyword_set(implied)
    if not keys:
        return None
    best: tuple[float, Path] | None = None
    try:
        candidates = sorted(MEMORY_DIR.glob("feedback_*.md"))
    except Exception:
        candidates = []
    for path in candidates:
        try:
            other = keyword_set(path.read_text(encoding="utf-8", errors="ignore"))
        except Exception:
            continue
        if not other:
            continue
        overlap = len(keys & other) / max(len(keys), 1)
        if overlap >= SIMILARITY_THRESHOLD and (best is None or overlap > best[0]):
            best = (overlap, path)
    return best[1] if best else None


def append_lesson_line(correction: dict) -> None:
    """Append one `- AVOID … — DO … (date)` line to lessons.md + .mdc mirror."""
    did = (correction.get("what_claude_did") or "").strip().rstrip(".")
    pref = (correction.get("implied_preference") or "").strip().rstrip(".")
    if not did or not pref:
        return
    portable = (correction.get("applies_to") or "") == "all_projects"
    prefix = "[portable] " if portable else ""
    line = f"- {prefix}AVOID {did} — DO {pref} ({now_date()})\n"
    key = keyword_set(did + " " + pref)
    for target in (LESSONS_MD, LESSONS_MDC):
        try:
            if not target.exists():
                continue  # only append where the rules file already exists
            existing = target.read_text(encoding="utf-8")
            # crude dedupe: skip if a very similar line is already present
            dup = any(len(key & keyword_set(l)) / max(len(key), 1) >= 0.7
                      for l in existing.splitlines() if l.startswith("- AVOID"))
            if dup:
                continue
            if not existing.endswith("\n"):
                existing += "\n"
            target.write_text(existing + line, encoding="utf-8")
            log(f"appended lesson to {target.name}")
        except Exception as exc:
            log(f"append_lesson_line({target.name}) failed: {exc}")


def update_memory_index(filename: str, description: str) -> None:
    try:
        existing = MEMORY_INDEX.read_text(encoding="utf-8") if MEMORY_INDEX.exists() else ""
        if filename in existing:
            return
        line = f"- [{description}]({filename}) — auto-extracted preference\n"
        if existing and not existing.endswith("\n"):
            existing += "\n"
        MEMORY_INDEX.parent.mkdir(parents=True, exist_ok=True)
        MEMORY_INDEX.write_text(existing + line, encoding="utf-8")
    except Exception:
        pass


def write_new_feedback(correction: dict) -> None:
    implied = correction.get("implied_preference") or ""
    if not implied:
        return
    slug = slugify(implied)
    path = MEMORY_DIR / f"feedback_{slug}.md"
    if path.exists():
        return
    body = f"""---
name: {slug.replace("_", "-")}
description: {implied[:200]}
metadata:
  type: feedback
  source: lessons-extractor
  category: {correction.get("category", "other")}
  confidence: {correction.get("confidence", "high")}
  applies_to: {correction.get("applies_to", "this_project")}
  first_captured: {now_date()}
---

**Rule:** {implied}

**Why:** {correction.get("what_user_said", "(no quote captured)")}

**How to apply:** When you are about to {(correction.get("what_claude_did") or "do the corrected thing").lower()}, do the rule above instead.
"""
    try:
        MEMORY_DIR.mkdir(parents=True, exist_ok=True)
        path.write_text(body, encoding="utf-8")
        update_memory_index(path.name, implied[:80])
        log(f"wrote feedback memory: {path.name}")
    except Exception as exc:
        log(f"write_new_feedback failed: {exc}")


def append_pending(correction: dict) -> None:
    try:
        MEMORY_DIR.mkdir(parents=True, exist_ok=True)
        header = "# Pending feedback (medium-confidence captures awaiting review)\n\n"
        existing = PENDING_FILE.read_text(encoding="utf-8") if PENDING_FILE.exists() else header
        block = (
            f"## {now_date()}\n"
            f"- **What Claude did:** {correction.get('what_claude_did','?')}\n"
            f"- **What user said:** {correction.get('what_user_said','?')}\n"
            f"- **Implied preference:** {correction.get('implied_preference','?')}\n\n"
        )
        PENDING_FILE.write_text(existing + block, encoding="utf-8")
    except Exception as exc:
        log(f"append_pending failed: {exc}")


def apply_corrections(corrections: Iterable[dict]) -> None:
    for c in corrections:
        if not isinstance(c, dict):
            continue
        confidence = (c.get("confidence") or "").lower()
        applies_to = c.get("applies_to", "this_project")
        if confidence == "high":
            append_lesson_line(c)
            if not find_similar(c.get("implied_preference", "")):
                write_new_feedback(c)
            if applies_to == "all_projects":
                log(
                    "portable lesson recorded in project rules only "
                    "(kit does not write ~/.claude/CLAUDE.md)"
                )
        elif confidence == "medium":
            append_pending(c)


def main() -> int:
    if os.environ.get("LUNA_LESSONS_AUTOEXTRACT", "on").strip().lower() == "off":
        return 0
    if NO_REFLECT_MARKER.exists():
        log("skip: .no-reflect marker present")
        return 0
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw) if raw.strip() else {}
    except Exception:
        payload = {}
    tp = payload.get("transcript_path") or payload.get("transcriptPath") or os.environ.get("CLAUDE_TRANSCRIPT_PATH", "")
    if not tp:
        log("skip: no transcript_path")
        return 0
    transcript_path = Path(tp)
    if not transcript_path.exists():
        log(f"skip: transcript not found: {transcript_path}")
        return 0
    events, user_count = load_transcript(transcript_path)
    if user_count < MIN_USER_MESSAGES:
        log(f"skip: only {user_count} user messages")
        return 0
    compact = build_compact_transcript(events)
    if not compact.strip():
        return 0
    result = run_extractor(EXTRACTOR_PROMPT + compact)
    if not result:
        return 0
    corrections = result.get("corrections") if isinstance(result, dict) else None
    if not isinstance(corrections, list):
        return 0
    log(f"extracted {len(corrections)} corrections")
    apply_corrections(corrections)
    log("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
