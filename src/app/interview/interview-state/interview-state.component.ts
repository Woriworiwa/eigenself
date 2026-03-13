import {
  Component,
  input,
  output,
  viewChild,
  ElementRef,
  AfterViewChecked,
  ChangeDetectionStrategy,
} from '@angular/core';
import { Message, InterviewMode } from '../interview.types';

@Component({
  selector: 'app-interview-state',
  templateUrl: './interview-state.component.html',
  styleUrl: './interview-state.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InterviewStateComponent implements AfterViewChecked {
  messages = input<Message[]>([]);
  agentTyping = input<boolean>(false);
  interviewMode = input<InterviewMode>('text');
  isRecording = input<boolean>(false);
  isSonicSpeaking = input<boolean>(false);
  isSonicListening = input<boolean>(false);
  voiceTranscript = input<string>('');
  conversationComplete = input<boolean>(false);
  currentTextInput = input<string>('');

  isPaused = input<boolean>(false);
  useAgent = input<boolean>(true);

  endInterview = output<void>();
  micClicked = output<void>();
  pauseClicked = output<void>();
  textChanged = output<string>();
  textKeydown = output<KeyboardEvent>();
  textSubmit = output<void>();
  sonicTextSubmit = output<void>();
  modeToggled = output<void>();
  agentToggled = output<void>();

  private conversationBodyEl = viewChild<ElementRef<HTMLDivElement>>('conversationBody');

  ngAfterViewChecked(): void {
    this.scrollToBottom();
  }

  onTextChange(event: Event): void {
    this.textChanged.emit((event.target as HTMLInputElement).value);
  }

  splitSentences(text: string): string[] {
    return text
      .replace(/\[?CONVERSATION_COMPLETE\]?/g, '')
      .split(/(?<=[.?!])\s+(?=[A-Z"'])/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  private scrollToBottom(): void {
    try {
      const el = this.conversationBodyEl()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    } catch {
      /* ignore */
    }
  }
}
