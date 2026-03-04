import {
  Component,
  input,
  output,
  signal,
  computed,
  effect,
  ChangeDetectionStrategy,
  OnDestroy,
  AfterViewInit,
  NgZone,
  inject,
  HostListener,
} from '@angular/core';
import { NgStyle } from '@angular/common';

interface Dot {
  x: number; y: number;
  tx: number; ty: number;
  size: number; opacity: number;
  ease: number;
  driftAmp: number; driftFreq: number; driftPhase: number;
}

// Messages that cycle during the long generation step.
// Ordered to feel like genuine progress, not random rotation.
const THINKING_MESSAGES: string[] = [
  'Building your identity document…',
  'Reading between the lines…',
  'Finding what makes you different…',
  'Mapping how you think…',
  'Listening to how you said things…',
  'Capturing your voice…',
  'Putting it all together…',
  'Almost there…',
];

// How long each message stays visible (ms)
const MESSAGE_INTERVAL = 3200;

@Component({
  selector: 'app-processing',
  templateUrl: './processing.component.html',
  styleUrl: './processing.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgStyle],
})
export class ProcessingComponent implements AfterViewInit, OnDestroy {
  showNamePrompt = input<boolean>(false);
  processingStatus = input<string>('');

  nameConfirmed = output<string>();
  nameInput = signal<string>('');

  // ── Display message — cycles during generation, otherwise shows status ─────

  messageIndex = signal<number>(0);
  private isCycling = signal<boolean>(false);

  displayMessage = computed(() => {
    if (this.isCycling()) {
      return THINKING_MESSAGES[this.messageIndex() % THINKING_MESSAGES.length];
    }
    return this.processingStatus();
  });

  // Start cycling when the parent sets the "building" status message,
  // stop cycling when status changes to something else (e.g. 'Done.')
  private readonly _statusEffect = effect(() => {
    const status = this.processingStatus();
    if (status === 'Building your identity document…') {
      this.startCycling();
    } else {
      this.stopCycling();
    }
  }, { allowSignalWrites: true });

  private cycleTimer: ReturnType<typeof setInterval> | null = null;

  private startCycling(): void {
    if (this.cycleTimer) return; // already running
    this.messageIndex.set(0);
    this.isCycling.set(true);
    this.cycleTimer = setInterval(() => {
      this.messageIndex.update(i => i + 1);
    }, MESSAGE_INTERVAL);
  }

  private stopCycling(): void {
    if (this.cycleTimer) {
      clearInterval(this.cycleTimer);
      this.cycleTimer = null;
    }
    this.isCycling.set(false);
  }

  // ── Dot physics ────────────────────────────────────────────────────────────

  dots = signal<Dot[]>([]);

  private rafId = 0;
  private cursorX = window.innerWidth / 2;
  private cursorY = window.innerHeight / 2;
  private clicking = false;
  private zone = inject(NgZone);

  ngAfterViewInit(): void {
    this.initDots();
    this.zone.runOutsideAngular(() => this.tick(performance.now()));
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.rafId);
    this.stopCycling();
  }

  private initDots(): void {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;

    const specs: Pick<Dot, 'size' | 'opacity' | 'ease' | 'driftAmp' | 'driftFreq' | 'driftPhase'>[] = [
      { size: 8,  opacity: 0.55, ease: 0.028, driftAmp: 28, driftFreq: 0.00055, driftPhase: 0.0 },
      { size: 14, opacity: 0.30, ease: 0.018, driftAmp: 40, driftFreq: 0.00040, driftPhase: 1.3 },
      { size: 10, opacity: 0.65, ease: 0.035, driftAmp: 20, driftFreq: 0.00070, driftPhase: 2.6 },
      { size: 20, opacity: 0.18, ease: 0.012, driftAmp: 55, driftFreq: 0.00030, driftPhase: 0.8 },
      { size: 12, opacity: 0.42, ease: 0.022, driftAmp: 35, driftFreq: 0.00048, driftPhase: 4.1 },
      { size: 6,  opacity: 0.70, ease: 0.042, driftAmp: 15, driftFreq: 0.00090, driftPhase: 3.5 },
      { size: 16, opacity: 0.22, ease: 0.015, driftAmp: 48, driftFreq: 0.00035, driftPhase: 5.2 },
    ];

    const offsets = [
      [-160, -80], [120, -60], [-60, 90], [180, 80], [-120, 40], [60, -110], [0, 130],
    ];

    this.dots.set(specs.map((s, i) => ({
      ...s,
      x:  cx + offsets[i][0], y:  cy + offsets[i][1],
      tx: cx + offsets[i][0], ty: cy + offsets[i][1],
    })));
  }

  private tick(t: number): void {
    const current = this.dots();
    let changed = false;

    const updated = current.map((dot) => {
      const driftX = Math.sin(t * dot.driftFreq + dot.driftPhase) * dot.driftAmp;
      const driftY = Math.cos(t * dot.driftFreq * 0.7 + dot.driftPhase) * dot.driftAmp * 0.6;

      const targetX = this.cursorX + driftX;
      const targetY = this.cursorY + driftY;
      const ease = this.clicking ? dot.ease * 12 : dot.ease;

      const nx = dot.x + (targetX - dot.x) * ease;
      const ny = dot.y + (targetY - dot.y) * ease;

      if (Math.abs(nx - dot.x) > 0.05 || Math.abs(ny - dot.y) > 0.05) changed = true;

      return { ...dot, x: nx, y: ny, tx: targetX, ty: targetY };
    });

    if (changed) this.zone.run(() => this.dots.set(updated));

    this.clicking = false;
    this.rafId = requestAnimationFrame((ts) => this.tick(ts));
  }

  @HostListener('mousemove', ['$event'])
  onMouseMove(e: MouseEvent): void {
    this.cursorX = e.clientX;
    this.cursorY = e.clientY;
  }

  @HostListener('click')
  onHostClick(): void {
    this.clicking = true;
  }

  // ── Name prompt ────────────────────────────────────────────────────────────

  onNameInput(event: Event): void {
    this.nameInput.set((event.target as HTMLInputElement).value);
  }

  handleNameKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.confirmName();
    }
  }

  confirmName(): void {
    const name = this.nameInput().trim();
    if (!name) return;
    this.nameConfirmed.emit(name);
  }
}
