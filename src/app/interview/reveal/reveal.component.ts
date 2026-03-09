import {
  Component,
  input,
  output,
  signal,
  ChangeDetectionStrategy,
  WritableSignal,
} from '@angular/core';
import { IdentityDocument } from '../interview.types';
import { environment } from '../../../environments/environment';

export interface StarterPrompt {
  label: string;
  text: string;
}

@Component({
  selector: 'app-reveal',
  templateUrl: './reveal.component.html',
  styleUrl: './reveal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RevealComponent {
  identityDoc    = input<IdentityDocument | null>(null);
  copyConfirmation   = input<string>('');
  profileUrl         = input<string>('');
  profilePublishing  = input<boolean>(false);
  profilePublishError = input<string>('');
  profileUrlCopied   = input<boolean>(false);

  copyDocumentClicked    = output<void>();
  downloadDocumentClicked = output<void>();
  publishProfileClicked  = output<void>();
  copyProfileUrlClicked  = output<void>();

  // ── Interview practice instructions ───────────────────────────────────────

  readonly interviewSteps: { step: string; instruction: string }[] = [
    {
      step: '1',
      instruction: 'Copy your identity document using the button above.',
    },
    {
      step: '2',
      instruction: 'Open ChatGPT, Claude, or any AI assistant and start a new conversation.',
    },
    {
      step: '3',
      instruction: 'Paste your document and add: "Read this. You are now going to interview me based on who I am — one question at a time. Start now."',
    },
    {
      step: '4',
      instruction: 'Answer naturally. The AI knows your thinking style and values, so the questions will feel relevant — not generic.',
    },
    {
      step: '5',
      instruction: 'After the session, ask it: "What did my answers reveal about me that I should highlight more?" — that\'s where it gets interesting.',
    },
  ];

  // ── Brainstorm starter prompts ────────────────────────────────────────────

  readonly starterPrompts: StarterPrompt[] = [
    {
      label: 'Career decisions',
      text: `I am considering [describe your situation or decision]. Based on who I am, what would you advise? Be honest, not generic.`,
    },
    {
      label: 'Future visioning',
      text: `Based on my strengths, thinking style, and values described here — what kinds of work, roles, or projects do you think I would find genuinely meaningful five years from now? Be specific.`,
    },
    {
      label: 'Blind spots',
      text: `Reading this honestly — what patterns do you notice that might be limiting me without my realising it? What am I likely not seeing about myself?`,
    },
  ];

  copiedPromptIndex    = signal<number | null>(null);
  openAccordionIndex   = signal<number | null>(null);

  toggleAccordion(index: number): void {
    this.openAccordionIndex.update(current => current === index ? null : index);
  }

  // ── Evaluate fit ────────────────────────────────────────────────────────────
  jobPostForEval  = signal('');
  evalLoading     = signal(false);
  evalResult      = signal('');
  evalError       = signal('');
  evalCopied      = signal(false);

  // ── Generate letter ─────────────────────────────────────────────────────────
  jobPostForLetter = signal('');
  letterLoading    = signal(false);
  letterResult     = signal('');
  letterError      = signal('');
  letterCopied     = signal(false);

  async evaluateFit(): Promise<void> {
    const protocol = this.identityDoc()?.raw;
    if (!protocol || !this.jobPostForEval().trim()) return;
    this.evalLoading.set(true);
    this.evalResult.set('');
    this.evalError.set('');
    try {
      const r = await fetch(`${environment.apiUrl}/api/evaluate-fit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ protocol, jobPost: this.jobPostForEval() }),
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      this.evalResult.set(data.report);
    } catch (e) {
      this.evalError.set(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      this.evalLoading.set(false);
    }
  }

  async generateLetter(): Promise<void> {
    const protocol = this.identityDoc()?.raw;
    if (!protocol || !this.jobPostForLetter().trim()) return;
    this.letterLoading.set(true);
    this.letterResult.set('');
    this.letterError.set('');
    try {
      const r = await fetch(`${environment.apiUrl}/api/generate-letter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ protocol, jobPost: this.jobPostForLetter() }),
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      this.letterResult.set(data.letter);
    } catch (e) {
      this.letterError.set(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      this.letterLoading.set(false);
    }
  }

  async copyResult(text: string, copiedSignal: WritableSignal<boolean>): Promise<void> {
    await this.copyToClipboard(text);
    copiedSignal.set(true);
    setTimeout(() => copiedSignal.set(false), 2000);
  }

  async copyStarterPrompt(index: number): Promise<void> {
    const prompts = this.starterPrompts;
    if (!prompts[index]) return;
    await this.copyToClipboard(prompts[index].text);
    this.copiedPromptIndex.set(index);
    setTimeout(() => this.copiedPromptIndex.set(null), 2000);
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  private async copyToClipboard(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
  }
}
