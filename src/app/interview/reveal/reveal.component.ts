import {
  Component,
  input,
  output,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { IdentityDocument } from '../interview.types';

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

  // ── Which "use" card is expanded ────────────────────────────────────────────
  expandedCard = signal<'share' | 'interview' | 'brainstorm' | 'save' | null>(null);

  toggleCard(card: 'share' | 'interview' | 'brainstorm' | 'save'): void {
    this.expandedCard.update(c => c === card ? null : card);
  }

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

  readonly starterPrompts = computed((): StarterPrompt[] => {
    const doc = this.identityDoc();
    const raw = doc?.raw ?? '';
    const docBlock = `\n\n---\n${raw}\n---\n\n`;
    return [
      {
        label: 'Career decisions',
        text: `Here is my identity document — it captures how I think, what I value, and how I communicate:${docBlock}I am considering [describe your situation or decision]. Based on who I am, what would you advise? Be honest, not generic.`,
      },
      {
        label: 'Future visioning',
        text: `Here is my identity document:${docBlock}Based on my strengths, thinking style, and values described here — what kinds of work, roles, or projects do you think I would find genuinely meaningful five years from now? Be specific.`,
      },
      {
        label: 'Blind spots',
        text: `Here is my identity document:${docBlock}Reading this honestly — what patterns do you notice that might be limiting me without my realising it? What am I likely not seeing about myself?`,
      },
    ];
  });

  copiedPromptIndex = signal<number | null>(null);

  async copyStarterPrompt(index: number): Promise<void> {
    const prompts = this.starterPrompts();
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
