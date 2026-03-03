import {
  Component,
  input,
  output,
  signal,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import { InterviewMode } from '../interview.types';

export type OnboardingPhase = 'intro' | 'prepare';

@Component({
  selector: 'app-onboarding',
  templateUrl: './onboarding.component.html',
  styleUrl: './onboarding.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingComponent implements OnInit {
  cvText = input<string>('');
  cvFileName = input<string>('');
  cvUploading = input<boolean>(false);
  cvError = input<string>('');
  supportsSonic = input<boolean>(false);

  modeSelected = output<InterviewMode>();
  cvFileChanged = output<Event>();
  cvRemoved = output<void>();
  cvPasted = output<string>();

  // ── Phase 1 — intro ───────────────────────────────────────────────────────

  readonly introParagraphs: string[] = [
    "Before we start — I want to tell you what this is, and what it isn't.",
    'I am not going to ask you to list your skills or summarise your experience. I have read enough CVs. I am more interested in how you actually think, what lights you up, and what makes you different from everyone with the same job title.',
    'We are going to have a real conversation — no script, no right answers, no way to get this wrong. It will take around 15 minutes. You can talk, type, or switch between both.',
    'At the end, I will build something that captures who you actually are — not just what you have done.',
  ];

  visibleParagraphs = signal<number>(0);
  introComplete = signal<boolean>(false);

  // ── Phase 2 — prepare ─────────────────────────────────────────────────────

  phase = signal<OnboardingPhase>('intro');
  // false → fading out, true → visible; drives the CSS opacity transition
  phaseVisible = signal<boolean>(true);

  cvPasteExpanded = signal<boolean>(false);
  cvPasteValue = signal<string>('');

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.startIntroAnimation();
  }

  private startIntroAnimation(): void {
    let index = 0;
    const showNext = (): void => {
      index++;
      this.visibleParagraphs.set(index);
      if (index < this.introParagraphs.length) {
        setTimeout(showNext, 650);
      } else {
        setTimeout(() => this.introComplete.set(true), 400);
      }
    };
    setTimeout(showNext, 500);
  }

  // ── Phase transition — fade out → swap → fade in ──────────────────────────

  goToPrepare(): void {
    this.phaseVisible.set(false);
    setTimeout(() => {
      this.phase.set('prepare');
      this.phaseVisible.set(true);
    }, 380);
  }

  // ── CV paste ──────────────────────────────────────────────────────────────

  toggleCvPaste(): void {
    this.cvPasteExpanded.set(!this.cvPasteExpanded());
  }

  onCvPasteInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.cvPasteValue.set(value);
    this.cvPasted.emit(value);
  }

  clearCvPaste(): void {
    this.cvPasteValue.set('');
    this.cvPasted.emit('');
  }
}
