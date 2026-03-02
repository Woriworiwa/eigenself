import {
  Component,
  signal,
  computed,
  OnDestroy,
  OnInit,
  AfterViewChecked,
  ChangeDetectionStrategy,
  inject,
  DestroyRef,
  ViewChild,
  ElementRef,
} from '@angular/core';

type AppState = 'welcome' | 'onboarding' | 'interview' | 'processing' | 'reveal';
type InterviewMode = 'voice-text' | 'text';

interface IdentityDocument {
  raw: string;        // full markdown document as returned by the API
  name: string;       // extracted name, or 'You' if unknown
  generated: string;  // ISO date string
}

interface Message {
  role: 'agent' | 'user';
  text: string;
  timestamp: Date;
}

interface ProtocolSignals {
  story: boolean;
  energy: boolean;
  voice: boolean;
  human_edge: boolean;
  expertise: boolean;
}

@Component({
  selector: 'app-interview',
  templateUrl: './interview.component.html',
  styleUrl: './interview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InterviewComponent implements OnDestroy, AfterViewChecked, OnInit {
  private _destroyRef = inject(DestroyRef);

  @ViewChild('conversationBody') conversationBody!: ElementRef<HTMLDivElement>;

  // ── Core state ─────────────────────────────────────────────────────────────

  currentState = signal<AppState>('welcome');
  interviewMode = signal<InterviewMode>('voice-text');
  identityDoc = signal<IdentityDocument | null>(null);
  userName = signal<string>('');
  nameConfirmed = signal<boolean>(false);

  // ── Processing state ───────────────────────────────────────────────────────

  processingStatus = signal<string>('Reading our conversation…');

  // ── Conversation state ─────────────────────────────────────────────────────

  messages = signal<Message[]>([]);
  protocolSignals = signal<ProtocolSignals>({
    story: false,
    energy: false,
    voice: false,
    human_edge: false,
    expertise: false,
  });
  conversationComplete = signal<boolean>(false);
  agentTyping = signal<boolean>(false);

  // ── CV upload state ────────────────────────────────────────────────────────

  cvText = signal<string>('');
  cvFileName = signal<string>('');
  cvUploading = signal<boolean>(false);
  cvError = signal<string>('');

  // ── UI state ───────────────────────────────────────────────────────────────

  copyConfirmation = signal<string>('');
  isSpeaking = signal<boolean>(false);
  currentTextInput = signal<string>('');

  // Voice recording state
  isRecording = signal<boolean>(false);
  voiceTranscript = signal<string>('');  // live display while recording

  // Name prompt state
  showNamePrompt = signal<boolean>(false);
  nameInput = signal<string>('');

  // Profile publishing
  profileUrl = signal<string>('');
  profileSlug = signal<string>('');
  profilePublishing = signal<boolean>(false);
  profilePublishError = signal<string>('');
  profileUrlCopied = signal<boolean>(false);

  // ── Onboarding ─────────────────────────────────────────────────────────────

  readonly onboardingParagraphs: string[] = [
    "Before we start — I want to tell you what this is, and what it isn't.",
    "I am not going to ask you to list your skills or summarise your experience. I have read enough CVs. I am more interested in how you actually think, what lights you up, and what makes you different from everyone with the same job title.",
    "We are going to have a real conversation. I will ask you things. You answer however feels natural — there is no script, no right answer, no way to get this wrong.",
    "At the end, I will build something that captures who you actually are — not just what you have done.",
    "When you are ready — tell me how you'd like to talk."
  ];

  visibleParagraphs = signal<number>(0);
  onboardingComplete = signal<boolean>(false);

  // ── Derived state ──────────────────────────────────────────────────────────

  progressPercent = computed(() => {
    const signals = this.protocolSignals();
    const filled = Object.values(signals).filter(Boolean).length;
    return (filled / 5) * 100;
  });

  // ── Private internals ──────────────────────────────────────────────────────

  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordingStream: MediaStream | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];

  ngOnInit(): void {
    // intentionally empty — animation starts on user action, not on load
  }

  enterOnboarding(): void {
    this.currentState.set('onboarding');
    this.startOnboardingAnimation();
  }

  ngOnDestroy(): void {
    this.stopRecording();
    this.timers.forEach(clearTimeout);
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  ngAfterViewChecked(): void {
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    try {
      const el = this.conversationBody?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    } catch { /* ignore */ }
  }

  private addTimer(t: ReturnType<typeof setTimeout>): ReturnType<typeof setTimeout> {
    this.timers.push(t);
    return t;
  }

  private stopRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.recordingStream) {
      this.recordingStream.getTracks().forEach(track => track.stop());
      this.recordingStream = null;
    }
    this.isRecording.set(false);
  }

  // ── Onboarding animation ───────────────────────────────────────────────────

  private startOnboardingAnimation(): void {
    let index = 0;
    const showNext = (): void => {
      index++;
      this.visibleParagraphs.set(index);
      if (index < this.onboardingParagraphs.length) {
        setTimeout(showNext, 600);
      } else {
        setTimeout(() => this.onboardingComplete.set(true), 300);
      }
    };
    setTimeout(showNext, 400);
  }

  // ── State transitions ──────────────────────────────────────────────────────

  selectMode(mode: InterviewMode): void {
    this.interviewMode.set(mode);
    this.startInterview();
  }

  async startInterview(): Promise<void> {
    this.currentState.set('interview');
    this.agentTyping.set(true);

    await new Promise(resolve => setTimeout(resolve, 600));

    if (this.cvText()) {
      // Agent reads the CV and opens with something specific.
      // We send a silent trigger message — it never shows in the UI.
      const opening = await this.sendToAgent('[START]');
      // Strip the trigger from messages — it was never a real user message.
      // The agent's response becomes the first thing the user sees.
      this.messages.update(msgs => [...msgs, {
        role: 'agent',
        text: opening.replace('[CONVERSATION_COMPLETE]', '').trim(),
        timestamp: new Date(),
      }]);
    } else {
      // No CV — use the default opening question.
      const opening = "What is something you have worked on recently that you are genuinely proud of? It does not have to be a big thing.";
      this.messages.update(msgs => [...msgs, {
        role: 'agent',
        text: opening,
        timestamp: new Date(),
      }]);
    }

    this.agentTyping.set(false);

    if (this.interviewMode() === 'voice-text') {
      await this.startRecording();
    }
  }

  async uploadCV(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // Validate type client-side before sending
    const allowed = ['application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const nameOk = file.name.endsWith('.pdf') || file.name.endsWith('.docx');
    if (!allowed.includes(file.type) && !nameOk) {
      this.cvError.set('Please upload a PDF or Word document.');
      return;
    }

    this.cvUploading.set(true);
    this.cvError.set('');
    this.cvFileName.set('');

    try {
      const formData = new FormData();
      formData.append('cv', file);

      const response = await fetch('http://localhost:3000/api/parse-cv', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json() as { cvText?: string; error?: string };

      if (!response.ok || data.error) {
        this.cvError.set(data.error ?? 'Upload failed. Please try again.');
        return;
      }

      this.cvText.set(data.cvText ?? '');
      this.cvFileName.set(file.name);
    } catch {
      this.cvError.set('Could not reach the server. Is it running?');
    } finally {
      this.cvUploading.set(false);
    }
  }

  removeCV(): void {
    this.cvText.set('');
    this.cvFileName.set('');
    this.cvError.set('');
  }

  // ── Voice recording (Amazon Transcribe) ────────────────────────────────────

  async startRecording(): Promise<void> {
    if (this.isRecording()) return;

    try {
      this.recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.warn('Microphone access denied:', err);
      return;
    }

    this.audioChunks = [];
    this.mediaRecorder = new MediaRecorder(this.recordingStream);

    this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/ogg; codecs=opus' });
      this.audioChunks = [];
      this.isRecording.set(false);

      if (audioBlob.size < 1000) {
        // Too small — user probably did not speak
        return;
      }

      await this.transcribeAndSubmit(audioBlob);
    };

    this.mediaRecorder.start();
    this.isRecording.set(true);
  }

  private async transcribeAndSubmit(audioBlob: Blob): Promise<void> {
    this.agentTyping.set(true); // show thinking indicator while transcribing

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.ogg');

      const response = await fetch('http://localhost:3000/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        console.error('Transcribe API error:', response.status);
        this.agentTyping.set(false);
        return;
      }

      const data = await response.json() as { transcript?: string };
      const transcript = data.transcript?.trim() ?? '';

      if (!transcript) {
        // Nothing was transcribed — stop thinking indicator and resume
        this.agentTyping.set(false);
        return;
      }

      // Show what was heard before sending to agent
      this.voiceTranscript.set(transcript);

      // Reset agentTyping so handleUserMessage can manage it properly
      this.agentTyping.set(false);
      await this.handleUserMessage(transcript);
      this.voiceTranscript.set('');

    } catch (error) {
      console.error('Transcribe error:', error);
      this.agentTyping.set(false);
    }
  }

  submitVoiceRecording(): void {
    if (this.isRecording()) {
      this.stopRecording();
      // onstop handler fires automatically and calls transcribeAndSubmit
    }
  }

  // ── Conversation engine ────────────────────────────────────────────────────

  async handleUserMessage(text: string): Promise<void> {
    if (!text.trim() || this.agentTyping()) return;

    this.messages.update(msgs => [...msgs, {
      role: 'user',
      text: text.trim(),
      timestamp: new Date(),
    }]);

    this.currentTextInput.set('');
    this.agentTyping.set(true);

    const agentResponse = await this.sendToAgent(text.trim());

    const isComplete = agentResponse.includes('[CONVERSATION_COMPLETE]');
    const cleanResponse = agentResponse.replace('[CONVERSATION_COMPLETE]', '').trim();

    this.messages.update(msgs => [...msgs, {
      role: 'agent',
      text: cleanResponse,
      timestamp: new Date(),
    }]);

    this.agentTyping.set(false);

    this.updateProtocolSignals();

    if (isComplete) {
      this.conversationComplete.set(true);
      if (!this.userName() && !this.cvText()) {
        // No name yet and no CV to extract it from — pause and ask before processing
        setTimeout(() => {
          this.currentState.set('processing');
          this.showNamePrompt.set(true);
        }, 800);
      } else {
        setTimeout(() => { void this.transitionToProcessing(); }, 1500);
      }
    } else if (this.interviewMode() === 'voice-text') {
      await this.startRecording();  // auto-resume after agent responds
    }
  }

  private async sendToAgent(userMessage: string): Promise<string> {
    const history = this.messages();

    // Bedrock requires conversations to start with a user message.
    const firstUserIndex = history.findIndex(m => m.role === 'user');

    let messagesToSend: { role: string; text: string }[];

    if (firstUserIndex === -1) {
      // No user messages yet — userMessage is the trigger (e.g., '[START]')
      messagesToSend = [{ role: 'user', text: userMessage }];
    } else if (firstUserIndex > 0) {
      // CV-triggered opening: agent messages exist before the first user message.
      // Reconstruct the full exchange including the [START] trigger so the agent
      // has context of its own opening question.
      messagesToSend = [
        { role: 'user', text: '[START]' },
        ...history.map(m => ({ role: m.role, text: m.text })),
      ];
    } else {
      // Normal case: history starts with a user message
      messagesToSend = history.slice(firstUserIndex)
        .map(msg => ({ role: msg.role, text: msg.text }));
    }

    try {
      const response = await fetch('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messagesToSend,
          cvText: this.cvText() || undefined,
        }),
      });

      if (!response.ok) {
        const err = await response.json() as { error?: string };
        console.error('Chat API error:', err.error ?? 'Server error');
        return "I'm having trouble connecting right now. Could you tell me more about that?";
      }

      const data = await response.json() as { text?: string };
      return data.text ?? '';
    } catch (error) {
      console.error('Chat API error:', error);
      // Graceful fallback — do not crash the conversation
      return "I'm having trouble connecting right now. Could you tell me more about that?";
    }
  }

  private updateProtocolSignals(): void {
    const agentCount = this.messages().filter(m => m.role === 'agent').length;
    this.protocolSignals.update(signals => ({
      story:      agentCount >= 1 ? true : signals.story,
      energy:     agentCount >= 2 ? true : signals.energy,
      voice:      agentCount >= 3 ? true : signals.voice,
      human_edge: agentCount >= 4 ? true : signals.human_edge,
      expertise:  agentCount >= 5 ? true : signals.expertise,
    }));
  }

  submitTextAnswer(): void {
    const input = this.currentTextInput().trim();
    if (!input) return;
    this.handleUserMessage(input);
  }

  handleTextKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.submitTextAnswer();
    }
  }

  onCurrentTextInput(event: Event): void {
    this.currentTextInput.set((event.target as HTMLInputElement).value);
  }

  // ── Voice output ───────────────────────────────────────────────────────────

  private speakText(text: string): Promise<void> {
    return new Promise(resolve => {
      const synth = window.speechSynthesis;
      if (!synth) { resolve(); return; }

      synth.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.rate = 0.95;
      utt.pitch = 1.0;
      utt.volume = 1.0;
      this.isSpeaking.set(true);
      utt.onend = () => { this.isSpeaking.set(false); resolve(); };
      utt.onerror = () => { this.isSpeaking.set(false); resolve(); };
      synth.speak(utt);
    });
  }

  // ── Name prompt ────────────────────────────────────────────────────────────

  onNameInput(event: Event): void {
    this.nameInput.set((event.target as HTMLInputElement).value);
  }

  confirmName(): void {
    const name = this.nameInput().trim();
    if (!name) return;
    this.userName.set(name);
    this.nameConfirmed.set(true);
    this.showNamePrompt.set(false);
    void this.transitionToProcessing();
  }

  handleNameKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.confirmName();
    }
  }

  // ── Processing & generation ────────────────────────────────────────────────

  private async transitionToProcessing(): Promise<void> {
    this.stopRecording();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    this.currentState.set('processing');

    try {
      // Step 1 — try to extract name from CV
      let resolvedName = '';

      if (this.cvText()) {
        this.processingStatus.set('Looking for your name…');
        try {
          const nameRes = await fetch('http://localhost:3000/api/extract-name', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cvText: this.cvText() }),
          });
          const nameData = await nameRes.json() as { name: string | null };
          if (nameData.name) {
            resolvedName = nameData.name;
            this.userName.set(resolvedName);
            this.nameConfirmed.set(true);
          }
        } catch {
          // name extraction failed — will ask in UI or proceed without
        }
      }

      // Step 2 — if no name from CV, check if we got it from conversation
      // (the agent may have asked for it — scan the last few user messages)
      if (!resolvedName) {
        const userMessages = this.messages()
          .filter(m => m.role === 'user')
          .map(m => m.text);
        // If the conversation was short and first user message looks like a name,
        // use it. This is a heuristic — the document prompt will handle it properly.
        const firstMsg = userMessages[0] ?? '';
        const looksLikeName = firstMsg.split(' ').length <= 4 && firstMsg.length < 40;
        if (looksLikeName) {
          resolvedName = firstMsg;
          this.userName.set(resolvedName);
        }
      }

      // Step 3 — generate the document
      this.processingStatus.set('Building your identity document…');

      const docRes = await fetch('http://localhost:3000/api/generate-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: this.messages().map(m => ({ role: m.role, text: m.text })),
          cvText: this.cvText() || undefined,
          userName: resolvedName || undefined,
        }),
      });

      if (!docRes.ok) {
        throw new Error('Document generation failed');
      }

      const docData = await docRes.json() as { document: string };

      this.identityDoc.set({
        raw: docData.document,
        name: resolvedName || 'You',
        generated: new Date().toISOString().slice(0, 10),
      });

      this.processingStatus.set('Done.');
      this.currentState.set('reveal');

    } catch (error) {
      console.error('Processing error:', error);
      // Fallback — show reveal with error state
      this.identityDoc.set({
        raw: '# Identity Document\n\nSomething went wrong generating your document. Please try again.',
        name: this.userName() || 'You',
        generated: new Date().toISOString().slice(0, 10),
      });
      this.currentState.set('reveal');
    }
  }

  // ── Output formats ─────────────────────────────────────────────────────────

  getDocumentText(): string {
    return this.identityDoc()?.raw ?? '';
  }

  getDocumentFileName(): string {
    const name = (this.identityDoc()?.name ?? 'identity')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    return `${name}-ai-clone.md`;
  }

  // ── Clipboard & download ───────────────────────────────────────────────────

  async copyDocument(): Promise<void> {
    await this.copyText(
      this.getDocumentText(),
      'Copied. Drop this into any AI agent.'
    );
  }

  downloadDocument(): void {
    const text = this.getDocumentText();
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.getDocumentFileName();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async publishProfile(): Promise<void> {
    const doc = this.identityDoc();
    if (!doc || this.profilePublishing()) return;

    this.profilePublishing.set(true);
    this.profilePublishError.set('');

    try {
      const response = await fetch('http://localhost:3000/api/publish-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identityDocument: doc.raw,
          userName: doc.name,
          existingSlug: this.profileSlug() || undefined,
        }),
      });

      const data = await response.json() as {
        profileUrl?: string;
        slug?: string;
        isUpdate?: boolean;
        error?: string;
      };

      if (!response.ok || data.error) {
        this.profilePublishError.set(data.error ?? 'Publishing failed. Please try again.');
        return;
      }

      this.profileUrl.set(data.profileUrl ?? '');
      this.profileSlug.set(data.slug ?? '');

    } catch {
      this.profilePublishError.set('Could not reach the server. Is it running?');
    } finally {
      this.profilePublishing.set(false);
    }
  }

  async copyProfileUrl(): Promise<void> {
    const url = this.profileUrl();
    if (!url) return;
    await this.copyText(url, '');
    this.profileUrlCopied.set(true);
    this.addTimer(setTimeout(() => this.profileUrlCopied.set(false), 2000));
  }

  private async copyText(text: string, message: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for environments without clipboard API
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    this.copyConfirmation.set(message);
    this.addTimer(setTimeout(() => this.copyConfirmation.set(''), 2000));
  }
}
