import {
  Component,
  input,
  output,
  signal,
  OnInit,
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
  isTyping?: boolean;        // show the typing dots instead of text
}

type ObStep =
  | 'agent-intro'            // agent's opening message visible, user hasn't replied yet
  | 'user-replied'           // user sent their first reply
  | 'agent-cv-ask'           // agent asked about CV
  | 'cv-decision'            // user is deciding (upload / paste / skip shown inline)
  | 'agent-mode-ask'         // agent asked how they want to talk
  | 'mode-decision';         // mode buttons shown — final step before handoff

@Component({
  selector: 'app-onboarding',
  templateUrl: './onboarding.component.html',
  styleUrl: './onboarding.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingComponent implements OnInit, AfterViewChecked {

  // ── Inputs ────────────────────────────────────────────────────────────────

  cvText     = input<string>('');
  cvFileName = input<string>('');
  cvUploading = input<boolean>(false);
  cvError    = input<string>('');
  supportsSonic = input<boolean>(false);

  // ── Outputs ───────────────────────────────────────────────────────────────

  modeSelected   = output<InterviewMode>();
  cvFileChanged  = output<Event>();
  cvRemoved      = output<void>();
  cvPasted       = output<string>();

  // ── Conversation state ────────────────────────────────────────────────────

  messages   = signal<ObMessage[]>([]);
  step       = signal<ObStep>('agent-intro');
  inputValue = signal<string>('');
  agentTyping = signal<boolean>(false);

  cvPasteExpanded = signal<boolean>(false);
  cvPasteValue    = signal<string>('');

  private conversationEl = viewChild<ElementRef<HTMLElement>>('conversationEl');
  private lastMsgEls = viewChildren<ElementRef<HTMLElement>>('lastMsg');
  private shouldScroll = false;

  // ── Static copy ───────────────────────────────────────────────────────────

  private readonly INTRO_MSG =
    `Before we start — a quick word about what this is.\n\nI'm not going to ask you to list your skills or summarise your experience. I've read enough CVs. I'm more interested in how you actually think, what lights you up, and what makes you different from everyone with the same job title.\n\nThis will take around 15 minutes. No script, no right answers.\n\nWhat's your name?`;

  private readonly CV_ASK_MSG =
    `Good to meet you. Do you have anything you'd like me to read before we start? A CV, a cover letter, a previous session transcript, or anything else that gives me context. I'll use it to skip the obvious and focus on what it can't tell me. Entirely optional — we can also just talk.`;

  private readonly MODE_ASK_MSG =
    `One last thing — how would you like to do this? You can speak and I'll listen in real time, or type if you'd rather go at your own pace. You can switch any time.`;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    // Show the opening message immediately — no delay, no stagger
    this.messages.set([{ role: 'agent', text: this.INTRO_MSG }]);
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll) {
      this.shouldScroll = false;
      setTimeout(() => this.scrollToLastMessage(), 0);
    }
  }

  private scrollToLastMessage(): void {
    const els = this.lastMsgEls();
    const last = els[els.length - 1]?.nativeElement;
    if (last) {
      last.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }

  // ── Input handling ────────────────────────────────────────────────────────

  onInputChange(event: Event): void {
    this.inputValue.set((event.target as HTMLInputElement).value);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.submitInput();
    }
  }

  submitInput(): void {
    const text = this.inputValue().trim();
    if (!text || this.agentTyping()) return;

    this.addUserMessage(text);
    this.inputValue.set('');

    const current = this.step();

    if (current === 'agent-intro') {
      // User gave their name / replied to intro → ask about CV
      this.step.set('user-replied');
      this.showAgentMessage(this.CV_ASK_MSG, 'cv-decision');
    } else if (current === 'cv-decision') {
      // User typed something (e.g. "no thanks") → treat as skip, go to mode
      this.showAgentMessage(this.MODE_ASK_MSG, 'mode-decision');
    }
  }

  // ── CV decisions ──────────────────────────────────────────────────────────

  skipCv(): void {
    this.addUserMessage('No CV — let\'s just talk.');
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
    this.addUserMessage('Here\'s some context — I\'ve pasted it in.');
    this.cvPasteExpanded.set(false);
    this.showAgentMessage(this.MODE_ASK_MSG, 'mode-decision');
  }

  clearCvPaste(): void {
    this.cvPasteValue.set('');
    this.cvPasted.emit('');
  }

  // Called by parent when file upload completes (cvFileName input changes)
  onCvUploaded(): void {
    // The parent will update cvFileName — we just need to advance the step
    // We watch for cvFileName to become non-empty in the template with @if
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
    const label = mode === 'sonic' ? 'I\'ll speak.' : 'I\'ll type.';
    this.addUserMessage(label);
    // Small delay so user sees their "reply" before handoff
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
          i === msgs.length - 1 && m.isTyping
            ? { role: 'agent', text }
            : m
        )
      );
      this.agentTyping.set(false);
      this.step.set(nextStep);
      this.shouldScroll = true;
      // second tick: inline affordance block will have rendered by now
      setTimeout(() => this.scrollToLastMessage(), 50);
    }, 900);
  }
}
