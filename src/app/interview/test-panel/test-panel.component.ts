import {
  Component,
  input,
  output,
  signal,
  effect,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import { environment } from '../../../environments/environment';

interface Persona {
  id: string;
  label: string;
  description: string;
  requiresCv?: boolean;
}

const PERSONAS: Persona[] = [
  {
    id: 'same',
    label: 'Same person (CV)',
    description: '',
    requiresCv: true,
  },
  {
    id: 'stupid',
    label: 'Stupid person',
    description: 'You struggle to understand questions and give shallow, confused, or off-topic answers. You miss the point, state obvious things, misinterpret what is being asked, and generally come across as not very bright. Keep answers short and a bit muddled.',
  },
  {
    id: 'communicator',
    label: 'Poor communicator',
    description: 'You have thoughts but cannot express them clearly. You ramble, use wrong words, start sentences and trail off, repeat yourself, and make it genuinely hard to follow what you mean. You are not stupid — just unable to articulate.',
  },
  {
    id: 'filler',
    label: 'Filler word speaker',
    description: 'You speak with constant filler words and hesitations. Sprinkle "umm", "uhh", "like", "you know", "I mean", "sort of", "kind of", "ahh", "uh", "right" and "basically" throughout every response. It should feel natural but very hesitant and pause-heavy.',
  },
];

@Component({
  selector: 'app-test-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tp">
      <div class="tp__header">
        <span class="tp__title">Test mode</span>
        <select
          class="tp__persona-select"
          [value]="selectedPersonaId()"
          (change)="onPersonaChange($event)"
          aria-label="Select test persona"
        >
          @for (p of personas; track p.id) {
            <option [value]="p.id" [disabled]="p.requiresCv && !cvText()">
              {{ p.label }}{{ p.requiresCv && !cvText() ? ' (no CV)' : '' }}
            </option>
          }
        </select>
      </div>

      <div class="tp__body">
        @if (loading()) {
          <div class="tp__loading" aria-live="polite" aria-label="Loading suggestions">
            <span class="tp__dot"></span>
            <span class="tp__dot"></span>
            <span class="tp__dot"></span>
          </div>
        } @else if (error()) {
          <p class="tp__error">{{ error() }}</p>
        } @else if (suggestions().length > 0) {
          @for (s of suggestions(); track $index) {
            <button class="tp__suggestion" type="button" (click)="pick(s)">
              {{ s }}
            </button>
          }
        } @else {
          <p class="tp__empty">Waiting for the interviewer…</p>
        }
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      width: 340px;
      flex-shrink: 0;
      border-left: 1px solid var(--line);
      background: var(--bg-warm);
      overflow: hidden;
    }

    .tp {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    .tp__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--sp-3);
      padding: var(--sp-4) var(--sp-5);
      border-bottom: 1px solid var(--line);
      flex-shrink: 0;
    }

    .tp__title {
      font-size: 0.68rem;
      font-weight: 600;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      color: var(--ink-4);
      font-family: var(--font-body);
      white-space: nowrap;
    }

    .tp__persona-select {
      font-size: 0.75rem;
      font-family: var(--font-body);
      color: var(--ink-2);
      background: var(--bg-inset);
      border: 1px solid var(--line);
      border-radius: var(--r-sm);
      padding: 3px var(--sp-2);
      cursor: pointer;
      min-width: 0;
      flex-shrink: 1;

      &:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
    }

    .tp__body {
      flex: 1;
      overflow-y: auto;
      padding: var(--sp-5);
      display: flex;
      flex-direction: column;
      gap: var(--sp-3);

      &::-webkit-scrollbar { width: 4px; }
      &::-webkit-scrollbar-track { background: transparent; }
      &::-webkit-scrollbar-thumb { background: var(--ink-5); border-radius: 10px; }
    }

    .tp__loading {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: var(--sp-4) 0;
    }

    @keyframes tpBounce {
      0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
      30% { transform: translateY(-4px); opacity: 1; }
    }

    .tp__dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--ink-4);
      animation: tpBounce 1.2s ease-in-out infinite;

      &:nth-child(2) { animation-delay: 0.2s; }
      &:nth-child(3) { animation-delay: 0.4s; }
    }

    .tp__suggestion {
      width: 100%;
      text-align: left;
      padding: var(--sp-4) var(--sp-4);
      background: var(--bg);
      border: 1px solid var(--line);
      border-radius: var(--r-md);
      color: var(--ink-2);
      font-size: 0.875rem;
      font-family: var(--font-body);
      line-height: 1.55;
      cursor: pointer;
      transition: all 0.15s;

      &:hover {
        border-color: var(--ink-4);
        color: var(--ink);
        background: var(--surface);
      }

      &:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    }

    .tp__empty {
      font-size: 0.8rem;
      color: var(--ink-5);
      font-style: italic;
      font-family: var(--font-body);
      padding: var(--sp-4) 0;
    }

    .tp__error {
      font-size: 0.8rem;
      color: var(--ink-3);
      font-family: var(--font-body);
      padding: var(--sp-4) 0;
    }
  `],
})
export class TestPanelComponent implements OnInit {
  lastAgentMessage = input<string>('');
  isSpeaking = input<boolean>(false);
  cvText = input<string>('');
  suggestionPicked = output<string>();

  readonly personas = PERSONAS;
  readonly selectedPersonaId = signal<string>('engineer');
  readonly suggestions = signal<string[]>([]);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string>('');

  // Incremented after each pick to force the effect to re-evaluate
  private readonly _refetch = signal<number>(0);

  private readonly _fetchEffect = effect(() => {
    const msg = this.lastAgentMessage();
    const speaking = this.isSpeaking();
    const persona = this.selectedPersonaId();
    this._refetch(); // tracked — changes after each pick

    if (!speaking && msg) {
      void this.fetchSuggestions(msg, persona);
    }
  });

  ngOnInit(): void {
    // Ensure initial fetch if the AI has already spoken when test mode activates
    const msg = this.lastAgentMessage();
    if (msg && !this.isSpeaking()) {
      void this.fetchSuggestions(msg, this.selectedPersonaId());
    }
  }

  onPersonaChange(event: Event): void {
    this.selectedPersonaId.set((event.target as HTMLSelectElement).value);
  }

  pick(text: string): void {
    this.suggestionPicked.emit(text);
    this.suggestions.set([]);
    this._refetch.update(n => n + 1);
  }

  private get selectedPersona(): Persona {
    return PERSONAS.find(p => p.id === this.selectedPersonaId()) ?? PERSONAS[0];
  }

  private async fetchSuggestions(question: string, _persona: string): Promise<void> {
    const persona = this.selectedPersona;

    // "Same person" requires a CV — show a hint if none is uploaded
    if (persona.requiresCv && !this.cvText()) {
      this.error.set('Upload a CV first to use this persona.');
      return;
    }

    this.loading.set(true);
    this.suggestions.set([]);
    this.error.set('');

    try {
      const res = await fetch(`${environment.apiUrl}/api/test-suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          personaId: persona.id,
          persona: persona.description,
          cvText: persona.requiresCv ? this.cvText() : undefined,
        }),
      });

      const data = await res.json() as { suggestions?: string[]; error?: string };

      if (!res.ok || data.error) {
        this.error.set(data.error ?? 'Failed to load suggestions');
        return;
      }

      this.suggestions.set(data.suggestions ?? []);
    } catch {
      this.error.set('Could not reach the server');
    } finally {
      this.loading.set(false);
    }
  }
}
