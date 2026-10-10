"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ID_INDEX } from "@/lib/catalog/catalogs.ts";
import type { FrameworkId } from "@/lib/catalog/types.ts";
import { INPUT_LIMITS } from "@/lib/mapping/config.ts";
import type { ControlInput, MappingResponse } from "@/lib/mapping/types.ts";
import { PUC_SAMPLES } from "@/lib/workflow/samples.ts";
import { loadWorkspace, saveWorkspace } from "@/lib/workflow/storage.ts";
import {
  addControl,
  applyAiResult,
  confirmControl,
  controlStatus,
  editControlText,
  editFramework,
  emptyWorkspace,
  findControl,
  loadSample,
  removeControl,
  reopenControl,
  type AiRecord,
  type ControlRecord,
  type FrameworkPatch,
  type Workspace,
} from "@/lib/workflow/workspace.ts";
import { ReviewPanel } from "./ReviewPanel.tsx";
import { Button, ControlStatusBadge, Legend, Notice } from "./ui.tsx";

const now = () => new Date().toISOString();
const storage = () => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

/** Sends one control to the server route. The API key never reaches the browser. */
async function requestMapping(record: ControlRecord): Promise<{ ok: true; ai: AiRecord } | { ok: false; error: string }> {
  const control = Object.fromEntries(Object.entries(record.current).filter(([, v]) => typeof v === "string" && v.trim())) as ControlInput;
  try {
    const res = await fetch("/api/map", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ control, sampleId: record.sampleId }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || "error" in body) {
      const message = body && typeof body.error === "string" ? body.error : "The mapping service did not respond. Please try again.";
      return { ok: false, error: body?.requestId ? `${message} (request ${String(body.requestId).slice(0, 8)})` : message };
    }
    const r = body as MappingResponse;
    return {
      ok: true,
      ai: { requestId: r.requestId, mode: r.mode, model: r.model, receivedAt: now(), input: { ...record.current }, proposal: r.proposal, guardrails: r.guardrails, notices: r.notices },
    };
  } catch {
    return { ok: false, error: "Could not reach the mapping service. Check your connection and try again." };
  }
}

function IntakeForm({ onAdd }: { onAdd: (input: ControlInput) => void }) {
  const [draft, setDraft] = useState<ControlInput>({ name: "", description: "" });
  const [more, setMore] = useState(false);
  const set = (k: keyof ControlInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft({ ...draft, [k]: e.target.value });
  const input = "mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900";
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!draft.name.trim() || !draft.description.trim()) return;
        const clean = Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, (v ?? "").trim()]).filter(([, v]) => v)) as ControlInput;
        onAdd(clean);
        setDraft({ name: "", description: "" });
        setMore(false);
      }}
    >
      <label className="block text-xs font-medium text-slate-600">
        Control name *
        <input required value={draft.name} onChange={set("name")} maxLength={INPUT_LIMITS.name} className={input} />
      </label>
      <label className="block text-xs font-medium text-slate-600">
        Description *
        <textarea required rows={3} value={draft.description} onChange={set("description")} maxLength={INPUT_LIMITS.description} className={input} />
      </label>
      {more ? (
        <>
          <label className="block text-xs font-medium text-slate-600">
            Objective
            <textarea rows={2} value={draft.objective ?? ""} onChange={set("objective")} maxLength={INPUT_LIMITS.objective} className={input} />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Activity
            <textarea rows={2} value={draft.activity ?? ""} onChange={set("activity")} maxLength={INPUT_LIMITS.activity} className={input} />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Owner
            <input value={draft.owner ?? ""} onChange={set("owner")} maxLength={INPUT_LIMITS.owner} className={input} />
          </label>
        </>
      ) : (
        <button type="button" className="text-xs text-slate-600 underline" onClick={() => setMore(true)}>
          Add objective, activity or owner (optional)
        </button>
      )}
      <Button type="submit" variant="primary" className="w-full">Add control</Button>
    </form>
  );
}

export function WorkspaceApp() {
  const [ws, setWs] = useState<Workspace | null>(null);
  const [discarded, setDiscarded] = useState(false);
  const [storageOk, setStorageOk] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [blockers, setBlockers] = useState<Record<string, string[]>>({});
  const [batch, setBatch] = useState<{ done: number; total: number; stopped: string | null } | null>(null);

  // Load once on the client; the server never sees this state. The ref keeps a second effect run
  // (React development mode) from reloading after a discard and hiding the notice.
  const loadedOnce = useRef(false);
  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    const loaded = loadWorkspace(storage(), ID_INDEX);
    setWs(loaded.ws);
    setDiscarded(loaded.discarded);
    setSelectedId(loaded.ws.controls[0]?.id ?? null);
  }, []);

  useEffect(() => {
    if (ws) setStorageOk(saveWorkspace(storage(), ws));
  }, [ws]);

  const change = useCallback((fn: (w: Workspace) => Workspace) => setWs((w) => (w ? fn(w) : w)), []);

  const runAi = useCallback(
    async (record: ControlRecord): Promise<string | null> => {
      setBusy((b) => new Set(b).add(record.id));
      setErrors(({ [record.id]: _, ...rest }) => rest);
      const result = await requestMapping(record);
      setBusy((b) => {
        const n = new Set(b);
        n.delete(record.id);
        return n;
      });
      if (!result.ok) {
        setErrors((e) => ({ ...e, [record.id]: result.error }));
        return result.error;
      }
      change((w) => applyAiResult(w, record.id, result.ai, now()));
      return null;
    },
    [change],
  );

  const counts = useMemo(() => {
    const c = { total: 0, confirmed: 0, "awaiting-review": 0, draft: 0 };
    for (const r of ws?.controls ?? []) {
      c.total += 1;
      c[controlStatus(r)] += 1;
    }
    return c;
  }, [ws]);

  if (!ws) return <p className="text-sm text-slate-500">Loading this tab's workspace…</p>;

  const selected = selectedId ? findControl(ws, selectedId) : null;
  const unmapped = ws.controls.filter((r) => !r.ai && !r.confirmed);

  const mapAll = async () => {
    setBatch({ done: 0, total: unmapped.length, stopped: null });
    for (let i = 0; i < unmapped.length; i++) {
      const error = await runAi(unmapped[i]);
      if (error) {
        setBatch({ done: i, total: unmapped.length, stopped: `${unmapped[i].id}: ${error}` });
        return;
      }
      setBatch({ done: i + 1, total: unmapped.length, stopped: null });
    }
  };

  const confirmFlow = (id: string) => {
    const res = confirmControl(ws, id, ID_INDEX, now());
    setBlockers((b) => ({ ...b, [id]: res.blockers }));
    if (res.blockers.length === 0) setWs(res.ws);
  };

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Control mapping workspace</h1>
            <p className="text-sm text-slate-600">
              Pacific Utilities Corporation (fictional). Enter controls, let the AI suggest a mapping to NIST CSF 2.0, ISO/IEC 27001:2022,
              CIS Controls v8.1 and SOC 2, then review, edit and confirm each one.
            </p>
          </div>
          <Legend />
        </div>
        <p className="rounded-md bg-slate-100 px-3 py-1.5 text-xs text-slate-700">
          Your work is kept only in this browser tab. Closing the tab deletes it. There are no accounts, no database and no saved sessions,
          and the server does not store what you type.
        </p>
        {discarded && <Notice tone="warn">Saved data in this tab failed validation and was discarded. The workspace starts empty.</Notice>}
        {!storageOk && <Notice tone="warn">This browser blocked tab storage, so your work will be lost if the page reloads.</Notice>}
      </header>

      <div className="grid gap-4 lg:grid-cols-[19rem_1fr]">
        <aside className="space-y-4">
          <section className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">1. Control intake</h2>
            </div>
            <Button
              variant="primary"
              className="mb-3 w-full"
              disabled={PUC_SAMPLES.every((s) => findControl(ws, s.id))}
              onClick={() => {
                change((w) => loadSample(w, PUC_SAMPLES, now()));
                if (!selectedId) setSelectedId(PUC_SAMPLES[0].id);
              }}
            >
              Load PUC sample (14 controls)
            </Button>
            <details>
              <summary className="cursor-pointer text-sm text-slate-700">Or enter your own control</summary>
              <div className="mt-2">
                <IntakeForm
                  onAdd={(input) => {
                    const r = addControl(ws, input, now());
                    if (r.id) {
                      setWs(r.ws);
                      setSelectedId(r.id);
                    }
                  }}
                />
              </div>
            </details>
          </section>

          <section className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Controls ({counts.total})</h2>
              {ws.controls.length > 0 && (
                <button
                  type="button"
                  className="text-xs text-red-700 underline"
                  onClick={() => {
                    if (window.confirm("Clear the whole workspace in this tab? This cannot be undone.")) {
                      setWs(emptyWorkspace());
                      setSelectedId(null);
                      setBlockers({});
                      setErrors({});
                      setBatch(null);
                    }
                  }}
                >
                  Clear all
                </button>
              )}
            </div>
            {ws.controls.length > 0 && (
              <p className="mt-1 text-xs text-slate-600">
                {counts.confirmed} confirmed · {counts["awaiting-review"]} awaiting review · {counts.draft} not mapped
              </p>
            )}
            {unmapped.length > 0 && (
              <Button variant="ai" className="mt-2 w-full" disabled={busy.size > 0} onClick={mapAll}>
                {batch && batch.done < batch.total && !batch.stopped ? `Asking AI… ${batch.done}/${batch.total}` : `Suggest mappings with AI (${unmapped.length})`}
              </Button>
            )}
            {batch?.stopped && <div className="mt-2"><Notice tone="error" title="Stopped">{batch.stopped}</Notice></div>}
            {ws.controls.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No controls yet. Load the PUC sample or enter a control.</p>
            ) : (
              <ul className="mt-2 max-h-[28rem] space-y-1 overflow-auto">
                {ws.controls.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(r.id)}
                      aria-current={r.id === selectedId}
                      className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm ${r.id === selectedId ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-mono text-xs opacity-70">{r.id}</span> {r.current.name}
                      </span>
                      {busy.has(r.id) ? <span className="text-[11px]">…</span> : <ControlStatusBadge status={controlStatus(r)} />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        <div className="min-w-0">
          {selected ? (
            <ReviewPanel
              key={selected.id}
              record={selected}
              aiBusy={busy.has(selected.id)}
              aiError={errors[selected.id] ?? null}
              blockers={blockers[selected.id] ?? []}
              onEditText={(field, value) => change((w) => editControlText(w, selected.id, field, value, now()))}
              onRunAi={() => {
                const edited = Object.values(selected.mapping).some((m) => m.edited);
                if (edited && !window.confirm("Replace your edits with a new AI suggestion?")) return;
                void runAi(selected);
              }}
              onPatch={(f: FrameworkId, patch: FrameworkPatch) => {
                change((w) => editFramework(w, selected.id, f, patch, now()));
                setBlockers(({ [selected.id]: _, ...rest }) => rest);
              }}
              onConfirm={() => confirmFlow(selected.id)}
              onReopen={() => change((w) => reopenControl(w, selected.id, now()))}
              onRemove={() => {
                if (!window.confirm(`Remove ${selected.id} from this tab's workspace?`)) return;
                change((w) => removeControl(w, selected.id));
                setSelectedId(ws.controls.find((c) => c.id !== selected.id)?.id ?? null);
              }}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              Select a control to review its mapping.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
