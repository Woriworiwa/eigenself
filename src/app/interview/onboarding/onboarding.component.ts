import {
  Component,
  input,
  output,
  signal,
  OnInit,
  AfterViewInit,
  ChangeDetectionStrategy,
  ElementRef,
  viewChild,
  viewChildren,
  AfterViewChecked,
} from '@angular/core';
import { InterviewMode } from '../interview.types';

interface ObMessage {
  role: 'agent' | 'user';
  text: string;
  isTyping?: boolean;
}

type ObStep =
  | 'intro-cta'        // intro visible, showing "I'm ready" + "What to expect" buttons
  | 'cv-decision'      // agent asked for context, inline affordances shown
  | 'agent-mode-ask'   // agent asked how they want to talk
  | 'mode-decision';   // mode buttons shown — final step before handoff

@Component({
  selector: 'app-onboarding',
  standalone: true,
  templateUrl: './onboarding.component.html',
  styleUrl: './onboarding.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingComponent implements OnInit, AfterViewInit, AfterViewChecked {

  // ── Inputs ────────────────────────────────────────────────────────────────
  cvText      = input<string>('');
  cvFileName  = input<string>('');
  cvUploading = input<boolean>(false);
  cvError     = input<string>('');
  supportsSonic = input<boolean>(false);

  // ── Outputs ───────────────────────────────────────────────────────────────
  modeSelected  = output<InterviewMode>();
  cvFileChanged = output<Event>();
  cvRemoved     = output<void>();
  cvPasted      = output<string>();

  // ── State ─────────────────────────────────────────────────────────────────
  messages        = signal<ObMessage[]>([]);
  step            = signal<ObStep>('intro-cta');
  agentTyping     = signal<boolean>(false);
  whatToExpand    = signal<boolean>(false);
  cvPasteExpanded = signal<boolean>(false);
  cvPasteValue    = signal<string>('');

  private conversationEl = viewChild<ElementRef<HTMLElement>>('conversationEl');
  private lastMsgEls     = viewChildren<ElementRef<HTMLElement>>('lastMsg');
  private shouldScroll   = false;

  // ── Static copy ───────────────────────────────────────────────────────────

  readonly INTRO_MSG =
    `Take a breath.\n\nThis conversation will be about you.\nI'll carry it — you just show up and talk.\n\nWe'll cover how you think, what drives you, where you draw the line, and what makes you different from everyone with the same job title.\n\nIt usually takes around 20 minutes. You can end it whenever you feel ready — there's a button, or just tell me you're done.`;

  readonly WHAT_TO_EXPECT =
    `Here's what happens:\n\n1. We'll have a conversation — I ask, you answer. No script, no right answers.\n2. You can upload or paste some context before we start if you want — a CV, notes, anything. Entirely optional.\n3. When you're ready to stop, say so or hit the end button. I'll then turn everything we talked about into a structured document that captures who you are.\n\nThat's it.`;

  private readonly CV_ASK_MSG =
    `Before we start — you can share some context if you'd like. A CV, a cover letter, notes, or even a previous conversation with Eigenself.\n\nSharing something helps me skip the obvious questions and spend the time on what really matters — the things no document can tell me.\n\nEntirely optional.`;

  private readonly MODE_ASK_MSG =
    `One last thing — how would you like to talk?`;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.messages.set([{ role: 'agent', text: this.INTRO_MSG }]);
  }

  ngAfterViewInit(): void {}

  ngAfterViewChecked(): void {
    if (this.shouldScroll) {
      this.shouldScroll = false;
      setTimeout(() => this.scrollToLastMessage(), 0);
    }
  }

  private scrollToLastMessage(): void {
    const els  = this.lastMsgEls();
    const last = els[els.length - 1]?.nativeElement;
    if (last) last.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  // ── CTA actions ───────────────────────────────────────────────────────────

  toggleWhatToExpect(): void {
    this.whatToExpand.set(!this.whatToExpand());
    this.shouldScroll = true;
  }

  ready(): void {
    this.addUserMessage("I'm ready.");
    this.showAgentMessage(this.CV_ASK_MSG, 'cv-decision');
  }

  // ── CV decisions ──────────────────────────────────────────────────────────

  skipCv(): void {
    this.addUserMessage("No context — let's just talk.");
    this.cvRemoved.emit();
    this.showAgentMessage(this.MODE_ASK_MSG, 'mode-decision');
  }

  toggleCvPaste(): void {
    this.cvPasteExpanded.set(!this.cvPasteExpanded());
  }

  onCvPasteInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.cvPasteValue.set(value);
    this.cvPasted.emit(value);
  }

  confirmCvPaste(): void {
    const text = this.cvPasteValue().trim();
    if (!text) return;
    this.cvPasted.emit(text);
    this.addUserMessage("Here's some context — I've pasted it in.");
    this.cvPasteExpanded.set(false);
    this.showAgentMessage(this.MODE_ASK_MSG, 'mode-decision');
  }

  clearCvPaste(): void {
    this.cvPasteValue.set('');
    this.cvPasted.emit('');
  }

  confirmCvFile(): void {
    const name = this.cvFileName();
    if (!name) return;
    this.addUserMessage(`I've uploaded ${name}.`);
    this.showAgentMessage(this.MODE_ASK_MSG, 'mode-decision');
  }

  removeCv(): void {
    this.cvRemoved.emit();
    this.cvPasteExpanded.set(false);
    this.cvPasteValue.set('');
    this.cvPasted.emit('');
  }

  // ── Mode selection ────────────────────────────────────────────────────────

  selectMode(mode: InterviewMode): void {
    const label = mode === 'sonic' ? "I'll speak." : "I'll type.";
    this.addUserMessage(label);
    setTimeout(() => this.modeSelected.emit(mode), 400);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private addUserMessage(text: string): void {
    this.messages.update(msgs => [...msgs, { role: 'user', text }]);
    this.shouldScroll = true;
  }

  private showAgentMessage(text: string, nextStep: ObStep): void {
    this.agentTyping.set(true);
    this.messages.update(msgs => [...msgs, { role: 'agent', text: '', isTyping: true }]);
    this.shouldScroll = true;

    setTimeout(() => {
      this.messages.update(msgs =>
        msgs.map((m, i) =>
          i === msgs.length - 1 && m.isTyping ? { role: 'agent', text } : m
        )
      );
      this.agentTyping.set(false);
      this.step.set(nextStep);
      this.shouldScroll = true;
      setTimeout(() => this.scrollToLastMessage(), 50);
    }, 900);
  }
}
