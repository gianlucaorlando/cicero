'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, FlaskConical, LocateFixed, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { createEmptyProfile, type Profile } from '@/lib/profile';
import { scenarios, type Scenario, type Step, type StepSnapshot } from '@/lib/testing/scenarios';
import type { ChatResponse, PlaceCandidate, Proposal, RouteProposal, Stop } from '@/lib/types';

type StepResult = {
  say: string;
  status: 'pending' | 'running' | 'pass' | 'fail' | 'error';
  durationMs?: number;
  reply?: string;
  failed: string[];
};

type SessionResult = { title: string; steps: StepResult[] };
type ScenarioResult = { id: string; sessions: SessionResult[] };

type Props = {
  ask: (text: string) => Promise<ChatResponse | null>;
  /** Triggers Cicerone's opening move (the hidden event sent when the page opens). */
  start: () => Promise<ChatResponse | null>;
  itinerary: Stop[];
  candidates: PlaceCandidate[];
  proposal: Proposal | null;
  routeProposal: RouteProposal | null;
  suggestions: string[];
  profile: Profile;
  /** Sets the run's throwaway profile; null hands the app back its real, synced one. */
  setProfile: (profile: Profile | null) => void;
  reset: () => void;
  onClose: () => void;
};

/** Long enough for React, the map markers and the chat's smooth scroll to catch up with a turn. */
const SETTLE_MS = 900;
const SESSION_RESET_MS = 400;
/** The run survives a reload of the page (HMR, a crash): it is kept for the tab's lifetime. */
const STORAGE_KEY = 'cicerone-test-run-v1';

function settle(ms = SETTLE_MS) {
  return new Promise<void>((resolve) => { setTimeout(resolve, ms); });
}

function isVisible(element: Element) {
  const box = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
}

function inside(element: Element, container: Element) {
  const a = element.getBoundingClientRect();
  const b = container.getBoundingClientRect();
  return a.top >= b.top - 1 && a.bottom <= b.bottom + 1 && a.left >= b.left - 1 && a.right <= b.right + 1;
}

/**
 * Controls a finger cannot hit reliably: under 40px on a touch screen, under
 * 24px (WCAG 2.2 AA) with a mouse. Map pins and the drag handle carry an
 * invisible larger touch area, so they are measured by that instead.
 */
function smallTargets() {
  const minimum = window.matchMedia?.('(pointer: coarse)').matches ? 40 : 24;
  const selector = [
    '.conversation button', '.conversation a[href]', '.place-popup button',
    '[data-slot="sheet-content"] button', '[data-slot="sheet-content"] a[href]',
    '.topbar button', '.route-summary', '.locate-button',
  ].join(', ');
  return Array.from(document.querySelectorAll<HTMLElement>(selector))
    .filter((element) => isVisible(element) && !element.closest('.test-panel') && !element.matches('.drag-handle-button'))
    .filter((element) => {
      const box = element.getBoundingClientRect();
      return box.height < minimum || box.width < minimum;
    })
    .map((element) => {
      const box = element.getBoundingClientRect();
      const name = (element.getAttribute('aria-label') || element.textContent || element.className.toString()).trim().slice(0, 36);
      return `${name} (${Math.round(box.width)}×${Math.round(box.height)})`;
    });
}

function readDom(): StepSnapshot['dom'] {
  const assistant = Array.from(document.querySelectorAll<HTMLElement>('.assistant-message:not(.thinking-message) .message-content p'));
  // Where the chat ends up after its smooth scroll, whether or not the animation has run.
  const messages = document.querySelector('.messages');
  if (messages) messages.scrollTop = messages.scrollHeight;
  const yes = document.querySelector('.proposal-card .proposal-actions [data-slot="button"]');
  return {
    stopMarkers: document.querySelectorAll('.map-stop-marker').length,
    candidateMarkers: document.querySelectorAll('.map-candidate-marker').length,
    previewMarkers: document.querySelectorAll('.map-preview-marker').length,
    itineraryRows: document.querySelectorAll('.itinerary-card ol li:not(.stop-removed)').length,
    placesCard: document.querySelector('.places-card') !== null,
    proposalCard: document.querySelector('.proposal-card:not(.route-proposal-card)') !== null,
    routeProposalCard: document.querySelector('.route-proposal-card') !== null,
    suggestionChips: document.querySelectorAll('.quick-prompts button').length,
    userMessages: document.querySelectorAll('.user-message').length,
    lastAssistantText: assistant.at(-1)?.textContent || '',
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    decisionVisible: yes && messages ? inside(yes, messages) : null,
    smallTargets: smallTargets(),
  };
}

type SavedRun = { results: ScenarioResult[]; running: boolean };

function loadRun(): SavedRun | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as SavedRun : null;
  } catch {
    return null;
  }
}

function saveRun(run: SavedRun) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(run));
  } catch { /* storage full or blocked: the run just is not kept across a reload */ }
}

function emptyResults(selected: Scenario[]): ScenarioResult[] {
  return selected.map((scenario) => ({
    id: scenario.id,
    sessions: scenario.sessions.map((session) => ({
      title: session.title,
      steps: session.steps.map((step) => ({ say: step.start ? '(apertura automatica della pagina)' : step.say, status: 'pending', failed: [] })),
    })),
  }));
}

function seconds(ms?: number) {
  return ms == null ? '-' : `${(ms / 1000).toFixed(1)} s`;
}

function reportMarkdown(results: ScenarioResult[]) {
  const lines: string[] = ['# Cicerone · report test GUI', `Data: ${new Date().toLocaleString('it-IT')}`, ''];
  for (const result of results) {
    const scenario = scenarios.find((item) => item.id === result.id);
    lines.push(`## ${scenario?.title || result.id}`);
    for (const session of result.sessions) {
      if (result.sessions.length > 1) lines.push(`### ${session.title}`);
      session.steps.forEach((step, index) => {
        const mark = step.status === 'pass' ? '✅' : step.status === 'fail' || step.status === 'error' ? '❌' : '⏳';
        lines.push(`${mark} Passo ${index + 1} (${seconds(step.durationMs)}): "${step.say}"`);
        if (step.reply) lines.push(`   Risposta: ${step.reply}`);
        step.failed.forEach((label) => lines.push(`   ✗ ${label}`));
      });
    }
    lines.push('');
  }
  return lines.join('\n');
}

function statusGlyph(status: StepResult['status']) {
  if (status === 'pass') return '✓';
  if (status === 'fail' || status === 'error') return '✗';
  return status === 'running' ? '…' : '·';
}

/**
 * Hidden GUI test runner. Drives the real conversation hook so the map, the
 * cards and the profile update exactly as they would for a user, then checks
 * state and DOM after every turn. Sessions inside a scenario restart the chat
 * but keep the profile, so memory across visits is tested too.
 */
export function TestPanel({ ask, start, itinerary, candidates, proposal, routeProposal, suggestions, profile, setProfile, reset, onClose }: Props) {
  const [selected, setSelected] = useState<string[]>(scenarios.map((scenario) => scenario.id));
  const [results, setResults] = useState<ScenarioResult[]>([]);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  /** A run cut short by a reload: its results are shown, with the step that was running marked. */
  const [interrupted, setInterrupted] = useState(false);
  const latest = useRef({ ask, start, itinerary, candidates, proposal, routeProposal, suggestions, profile });
  const cancelled = useRef(false);

  useEffect(() => {
    latest.current = { ask, start, itinerary, candidates, proposal, routeProposal, suggestions, profile };
  }, [ask, start, itinerary, candidates, proposal, routeProposal, suggestions, profile]);

  // Restore the last run of this tab; a run that was still going when the page reloaded is marked.
  useEffect(() => {
    const saved = loadRun();
    if (!saved?.results.length) return;
    const timeout = window.setTimeout(() => {
      setInterrupted(saved.running);
      setResults(saved.running
        ? saved.results.map((scenario) => ({
            ...scenario,
            sessions: scenario.sessions.map((session) => ({
              ...session,
              steps: session.steps.map((step) => (step.status === 'running'
                ? { ...step, status: 'error' as const, failed: ['Interrotto: la pagina si è ricaricata durante il passo'] }
                : step)),
            })),
          }))
        : saved.results);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (results.length) saveRun({ results, running });
  }, [results, running]);

  const updateStep = useCallback((scenarioIndex: number, sessionIndex: number, stepIndex: number, patch: Partial<StepResult>) => {
    setResults((current) => current.map((scenario, sIndex) => (sIndex !== scenarioIndex ? scenario : {
      ...scenario,
      sessions: scenario.sessions.map((session, index) => (index !== sessionIndex ? session : {
        ...session,
        steps: session.steps.map((step, i) => (i === stepIndex ? { ...step, ...patch } : step)),
      })),
    })));
  }, []);

  async function runStep(step: Step, previous: StepSnapshot | null): Promise<{ snapshot: StepSnapshot; failed: string[] }> {
    const started = performance.now();
    const response = step.start ? await latest.current.start() : await latest.current.ask(step.say);
    await settle();
    const { itinerary: stops, candidates: shown, proposal: proposed, routeProposal: walk, suggestions: replies, profile: current } = latest.current;
    const snapshot: StepSnapshot = {
      reply: response?.reply || '',
      actions: response?.actions || [],
      itinerary: stops,
      candidates: shown,
      proposal: proposed,
      routeProposal: walk,
      suggestions: replies,
      profile: current,
      dom: readDom(),
      durationMs: Math.round(performance.now() - started),
    };
    const failed = step.checks.filter((check) => !check.pass(snapshot, previous)).map((check) => check.label);
    if (!response) failed.unshift('Nessuna risposta dal server');
    return { snapshot, failed };
  }

  async function runAll() {
    const chosen = scenarios.filter((scenario) => selected.includes(scenario.id));
    if (!chosen.length || running) return;
    cancelled.current = false;
    setRunning(true);
    setCopied(false);
    setInterrupted(false);
    setResults(emptyResults(chosen));

    try {
      for (const [scenarioIndex, scenario] of chosen.entries()) {
        if (cancelled.current) break;
        setProfile(createEmptyProfile());

        for (const [sessionIndex, session] of scenario.sessions.entries()) {
          if (cancelled.current) break;
          reset();
          await settle(SESSION_RESET_MS);

          let previous: StepSnapshot | null = null;
          for (const [stepIndex, step] of session.steps.entries()) {
            if (cancelled.current) break;
            updateStep(scenarioIndex, sessionIndex, stepIndex, { status: 'running' });
            try {
              const { snapshot, failed } = await runStep(step, previous);
              previous = snapshot;
              updateStep(scenarioIndex, sessionIndex, stepIndex, {
                status: failed.length ? 'fail' : 'pass',
                durationMs: snapshot.durationMs,
                reply: snapshot.reply,
                failed,
              });
            } catch (error) {
              updateStep(scenarioIndex, sessionIndex, stepIndex, { status: 'error', failed: [error instanceof Error ? error.message : 'Errore imprevisto'] });
            }
          }
        }
      }
    } finally {
      reset();
      // Back to the real profile: the run never wrote to it, so nothing to restore.
      setProfile(null);
      setRunning(false);
    }
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(reportMarkdown(results));
      setCopied(true);
    } catch { /* clipboard unavailable: the report stays visible in the panel */ }
  }

  const allSteps = results.flatMap((result) => result.sessions.flatMap((session) => session.steps));
  const totals = {
    pass: allSteps.filter((step) => step.status === 'pass').length,
    fail: allSteps.filter((step) => step.status === 'fail' || step.status === 'error').length,
  };

  return (
    <aside className="test-panel" aria-label="Pannello test GUI">
      <header>
        <strong><FlaskConical /> Test GUI</strong>
        <span>{results.length ? `${totals.pass} ok · ${totals.fail} falliti` : `${selected.length} scenari selezionati`}</span>
        <Button type="button" variant="ghost" size="icon" aria-label="Chiudi il pannello test" onClick={onClose} disabled={running}><X /></Button>
      </header>

      {interrupted && (
        <p className="test-panel-note" role="alert">L’ultima esecuzione si è interrotta perché la pagina si è ricaricata: qui sotto i risultati fino a quel punto.</p>
      )}

      <div className="test-panel-actions">
        <Button type="button" size="sm" onClick={() => void runAll()} disabled={running || !selected.length}>
          {running ? <><LocateFixed className="spin" /> In esecuzione…</> : 'Esegui'}
        </Button>
        {running && <Button type="button" size="sm" variant="outline" onClick={() => { cancelled.current = true; }}>Interrompi</Button>}
        {!running && (
          <>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(scenarios.map((scenario) => scenario.id))}>Tutti</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelected([])}>Nessuno</Button>
          </>
        )}
        {!running && results.length > 0 && (
          <Button type="button" size="sm" variant="outline" onClick={() => void copyReport()}>
            {copied ? <><Check /> Copiato</> : <><Copy /> Copia report</>}
          </Button>
        )}
      </div>

      <ol className="test-panel-list">
        {scenarios.map((scenario) => {
          const result = results.find((item) => item.id === scenario.id);
          const checked = selected.includes(scenario.id);
          const stepCount = scenario.sessions.reduce((sum, session) => sum + session.steps.length, 0);
          return (
            <li key={scenario.id}>
              <label className="test-scenario-head" aria-label={`Includi lo scenario ${scenario.title}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={running}
                  onChange={() => setSelected((current) => (checked ? current.filter((id) => id !== scenario.id) : [...current, scenario.id]))}
                />
                <span>
                  <strong>{scenario.title}</strong>
                  <small>{scenario.description}</small>
                  <small>{scenario.sessions.length > 1 ? `${scenario.sessions.length} sessioni · ` : ''}{stepCount} passi</small>
                </span>
              </label>
              {result && result.sessions.map((session, sessionIndex) => (
                <div className="test-session" key={sessionIndex}>
                  {result.sessions.length > 1 && <h4>{session.title}</h4>}
                  <ol className="test-steps">
                    {session.steps.map((step, index) => (
                      <li key={index} className={`test-step ${step.status}`}>
                        <span className="test-step-status" aria-label={step.status}>{statusGlyph(step.status)}</span>
                        <div>
                          <span>“{step.say}”</span>
                          {step.durationMs != null && <small>{seconds(step.durationMs)}</small>}
                          {step.reply && <em>{step.reply}</em>}
                          {step.failed.map((label) => <b key={label}>✗ {label}</b>)}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </li>
          );
        })}
      </ol>
      <p className="test-panel-note">Ogni scenario parte da chat e profilo vuoti; tra le sessioni di uno scenario la chat ricomincia ma il profilo resta. Il tuo profilo viene ripristinato alla fine. Le chiamate al modello e a Google Places sono reali.</p>
    </aside>
  );
}
