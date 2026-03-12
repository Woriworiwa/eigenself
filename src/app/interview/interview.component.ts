import {
  Component,
  signal,
  computed,
  effect,
  OnDestroy,
  ChangeDetectionStrategy,
  inject,
  DestroyRef,
} from '@angular/core';

import { environment } from '../../environments/environment';
import { SonicService, SonicTranscriptEntry } from '../services/sonic.service';
import { AppState, InterviewMode, IdentityDocument, Message, ProtocolSignals } from './interview.types';
import { OnboardingComponent } from './onboarding/onboarding.component';
import { InterviewStateComponent } from './interview-state/interview-state.component';
import { ProcessingComponent } from './processing/processing.component';
import { RevealComponent } from './reveal/reveal.component';
import { TestPanelComponent } from './test-panel/test-panel.component';

@Component({
  selector: 'app-interview',
  templateUrl: './interview.component.html',
  styleUrl: './interview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OnboardingComponent, InterviewStateComponent, ProcessingComponent, RevealComponent, TestPanelComponent],
})
export class InterviewComponent implements OnDestroy {
  private _destroyRef = inject(DestroyRef);
  private sonicService = inject(SonicService);

  // ── Core state ─────────────────────────────────────────────────────────────

  currentState = signal<AppState>('onboarding');
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
  testMode = signal<boolean>(false);
  isSpeaking = signal<boolean>(false);
  currentTextInput = signal<string>('');

  // Voice recording state
  isRecording = signal<boolean>(false);
  voiceTranscript = signal<string>(''); // live display while recording

  // Name prompt state
  showNamePrompt = signal<boolean>(false);

  // ── Sonic state ─────────────────────────────────────────────────────────────

  readonly sonicState = computed<'connecting' | 'ready' | 'listening' | 'speaking' | 'complete' | 'error'>(() => {
    if (this.sonicService.error()) return 'error';
    if (this.sonicService.conversationComplete()) return 'complete';
    if (this.sonicService.agentSpeaking()) return 'speaking';
    if (this.sonicService.listening()) return 'listening';
    if (this.sonicService.sessionReady()) return 'ready';
    return 'connecting';
  });

  readonly sonicError = this.sonicService.error;
  readonly isMicActive = this.sonicService.listening;
  readonly isSonicSpeaking = computed(() => this.sonicService.agentSpeaking());
  readonly isSonicListening = computed(() => this.sonicService.listening());
  readonly supportsSonic = signal<boolean>(this._checkSonicSupport());
  private readonly sonicUserPaused = signal<boolean>(false);
  readonly sonicPaused = computed(() =>
    this.interviewMode() === 'sonic' && this.sonicUserPaused(),
  );

  // Sync fullTranscript → messages during sonic mode
  private readonly _sonicTranscriptEffect = effect(() => {
    if (this.interviewMode() !== 'sonic') return;
    const transcript = this.sonicService.fullTranscript();
    this.messages.set(
      transcript.map((t: SonicTranscriptEntry) => ({
        role: t.role,
        text: t.text,
        timestamp: new Date(),
      })),
    );
  }, { allowSignalWrites: true });

  // Track whether the sonic opening prompt has been sent for the current session
  private _sonicOpeningPromptSent = false;

  // Start mic once the sonic session is ready (skip if user manually paused).
  // On first ready, send a silent trigger so the AI opens the conversation.
  private readonly _sonicReadyEffect = effect(() => {
    if (this.interviewMode() !== 'sonic') return;
    if (!this.sonicService.sessionReady() || this.sonicService.listening()) return;
    if (this.sonicUserPaused()) return;

    if (!this._sonicOpeningPromptSent) {
      this._sonicOpeningPromptSent = true;
      // Send a neutral "hi" so Nova Sonic has a user turn to respond to.
      // The system prompt instructs it to open with its first question — not react to this.
      this.sonicService.sendText('hi');
    }

    void this.sonicService.startListening();
  });

  // Transition to processing when sonic conversation ends
  private readonly _sonicCompleteEffect = effect(() => {
    if (this.interviewMode() !== 'sonic') return;
    if (!this.sonicService.conversationComplete()) return;
    this.conversationComplete.set(true);
    this.addTimer(setTimeout(() => {
      void this.transitionToProcessing();
    }, 800));
  }, { allowSignalWrites: true });

  // Profile publishing
  profileUrl = signal<string>('');
  profileSlug = signal<string>('');
  profilePublishing = signal<boolean>(false);
  profilePublishError = signal<string>('');
  profileUrlCopied = signal<boolean>(false);

  // ── Derived state ──────────────────────────────────────────────────────────

  readonly lastAgentMessage = computed(() => {
    const msgs = this.messages();
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'agent') return msgs[i].text;
    }
    return '';
  });

  progressPercent = computed(() => {
    const signals = this.protocolSignals();
    const filled = Object.values(signals).filter(Boolean).length;
    return (filled / 5) * 100;
  });

  // ── Agent session ──────────────────────────────────────────────────────────

  // Stable ID for this interview — passed to the Bedrock Agent so it can
  // maintain conversation memory on the AWS side across turns.
  private readonly agentSessionId = crypto.randomUUID();

  // Set to true once the agent endpoint confirms it is available.
  // Falls back to /api/chat if the agent is not configured.
  useAgent = signal<boolean>(true);


  // ── Private internals ──────────────────────────────────────────────────────

  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordingStream: MediaStream | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];

  ngOnDestroy(): void {
    this.sonicService.disconnect();
    this.stopRecording();
    this.timers.forEach(clearTimeout);
    if (window.speechSynthesis) window.speechSynthesis.cancel();
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
      this.recordingStream.getTracks().forEach((track) => track.stop());
      this.recordingStream = null;
    }
    this.isRecording.set(false);
  }

  // ── State transitions ──────────────────────────────────────────────────────

  selectMode(mode: InterviewMode): void {
    this.interviewMode.set(mode);
    this.startInterview();
  }

  private _checkSonicSupport(): boolean {
    if (navigator.userAgent.toLowerCase().includes('firefox')) return false;
    try {
      const ctx = new AudioContext();
      const hasWorklet = 'audioWorklet' in ctx;
      void ctx.close();
      return hasWorklet;
    } catch {
      return false;
    }
  }

  private async _startSonicSession(): Promise<void> {
    try {
      this.sonicUserPaused.set(false);
      this._sonicOpeningPromptSent = false;
      await this.sonicService.connect();
      this.sonicService.startSession('', this.cvText() || undefined);
      // _sonicReadyEffect handles startListening() once sessionReady is true
    } catch (err) {
      console.error('[Sonic] Start error:', err);
    }
  }

  onMicClicked(): void {
    if (this.interviewMode() === 'sonic') {
      this.toggleSonicMic();
    } else {
      this.isRecording() ? this.submitVoiceRecording() : void this.startRecording();
    }
  }

  onPauseClicked(): void {
    if (this.interviewMode() === 'sonic') {
      this.toggleSonicMic();
    }
  }

  private toggleSonicMic(): void {
    if (this.sonicService.listening()) {
      this.sonicUserPaused.set(true);
      void this.sonicService.stopListening();
    } else {
      this.sonicUserPaused.set(false);
      void this.sonicService.startListening();
    }
  }

  sendSonicText(): void {
    const text = this.currentTextInput().trim();
    if (!text) return;
    this.sonicService.sendText(text);
    this.currentTextInput.set('');
  }

  onSuggestionPicked(text: string): void {
    if (this.interviewMode() === 'sonic') {
      this.sonicService.sendText(text);
      void this.speakText(text);
    } else {
      void this.handleUserMessage(text);
    }
  }

  async startInterview(): Promise<void> {
    this.currentState.set('interview');

    if (this.interviewMode() === 'sonic') {
      await this._startSonicSession(); // mic requested here, after camera
      return;
    }

    this.agentTyping.set(true);
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Ask the agent to open the conversation with a natural first question.
    // We send a plain instruction so the agent has clear intent regardless
    // of whether a CV was provided. cvText is injected in sendToAgent()
    // on the first turn automatically.
    const openingPrompt = this.cvText()
      ? 'Please open the interview. You have the document — use something specific from it to start, then move to what it cannot tell you.'
      : 'Please open the interview with your first question.';

    const opening = await this.sendToAgent(openingPrompt);

    this.messages.update((msgs) => [
      ...msgs,
      {
        role: 'agent',
        text: opening.replace('[CONVERSATION_COMPLETE]', '').trim(),
        timestamp: new Date(),
      },
    ]);

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
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
    ];
    const nameOk = file.name.endsWith('.pdf') || file.name.endsWith('.docx') ||
                   file.name.endsWith('.txt') || file.name.endsWith('.md');
    if (!allowed.includes(file.type) && !nameOk) {
      this.cvError.set('Please upload a PDF, Word document, or Markdown file.');
      return;
    }

    this.cvUploading.set(true);
    this.cvError.set('');
    this.cvFileName.set('');

    try {
      const formData = new FormData();
      formData.append('cv', file);

      const response = await fetch(`${environment.apiUrl}/api/parse-cv`, {
        method: 'POST',
        body: formData,
      });

      const data = (await response.json()) as { cvText?: string; error?: string };

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

    // Detect the best supported MIME type for this browser
    const preferredTypes = [
      'audio/webm; codecs=opus',
      'audio/webm',
      'audio/ogg; codecs=opus',
      'audio/ogg',
      'audio/mp4',
    ];
    const supportedType = preferredTypes.find(t => MediaRecorder.isTypeSupported(t)) ?? '';

    this.audioChunks = [];
    this.mediaRecorder = supportedType
      ? new MediaRecorder(this.recordingStream, { mimeType: supportedType })
      : new MediaRecorder(this.recordingStream);

    // Store the actual MIME type being used
    const actualMimeType = this.mediaRecorder.mimeType;
    console.log('Recording with MIME type:', actualMimeType);

    this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = async () => {
      // Use the actual MIME type from the recorder, not a hardcoded one
      const audioBlob = new Blob(this.audioChunks, { type: actualMimeType || 'audio/webm' });
      this.audioChunks = [];
      this.isRecording.set(false);

      if (audioBlob.size < 1000) {
        return;
      }

      await this.transcribeAndSubmit(audioBlob);
    };

    this.mediaRecorder.start();
    this.isRecording.set(true);
  }

  // Decode any browser audio format (WebM, OGG, MP4) to raw 16-bit PCM at 16 kHz.
  // AudioContext.decodeAudioData handles whatever the browser recorded,
  // and resampling to 16 kHz is requested via the AudioContext constructor.
  // Amazon Transcribe Streaming accepts raw PCM without a container header.
  private async convertToPcm(audioBlob: Blob): Promise<{ pcmBlob: Blob; sampleRate: number }> {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioContext = new AudioContext({ sampleRate: 16000 });
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    await audioContext.close();

    const channelData = audioBuffer.getChannelData(0); // mono — channel 0 is sufficient for speech
    const int16 = new Int16Array(channelData.length);
    for (let i = 0; i < channelData.length; i++) {
      const s = Math.max(-1, Math.min(1, channelData[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    return {
      pcmBlob: new Blob([int16.buffer], { type: 'audio/pcm' }),
      sampleRate: audioBuffer.sampleRate,
    };
  }

  private async transcribeAndSubmit(audioBlob: Blob): Promise<void> {
    this.agentTyping.set(true); // show thinking indicator while transcribing

    try {
      const { pcmBlob, sampleRate } = await this.convertToPcm(audioBlob);

      const formData = new FormData();
      formData.append('audio', pcmBlob, 'recording.pcm');
      formData.append('sampleRate', sampleRate.toString());

      const response = await fetch(`${environment.apiUrl}/api/transcribe`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        console.error('Transcribe API error:', response.status);
        this.agentTyping.set(false);
        return;
      }

      const data = (await response.json()) as { transcript?: string };
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

    this.messages.update((msgs) => [
      ...msgs,
      {
        role: 'user',
        text: text.trim(),
        timestamp: new Date(),
      },
    ]);

    this.currentTextInput.set('');
    this.agentTyping.set(true);

    const agentResponse = await this.sendToAgent(text.trim());

    const isComplete = agentResponse.includes('[CONVERSATION_COMPLETE]');
    const cleanResponse = agentResponse.replace('[CONVERSATION_COMPLETE]', '').trim();

    this.messages.update((msgs) => [
      ...msgs,
      {
        role: 'agent',
        text: cleanResponse,
        timestamp: new Date(),
      },
    ]);

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
        setTimeout(() => {
          void this.transitionToProcessing();
        }, 1500);
      }
    } else if (this.interviewMode() === 'voice-text') {
      await this.startRecording(); // auto-resume after agent responds
    }
  }

  private async sendToAgent(userMessage: string): Promise<string> {
    if (this.useAgent()) {
      console.log('[Agent] → /api/agent-chat', { sessionId: this.agentSessionId, message: userMessage.slice(0, 60) });
      try {
        const response = await fetch(`${environment.apiUrl}/api/agent-chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: this.agentSessionId,
            message: userMessage,
            cvText: this.cvText() || undefined,
          }),
        });

        if (response.status === 503) {
          // Agent not configured on this server — fall back silently
          console.warn('Bedrock Agent not available, falling back to /api/chat');
          this.useAgent.set(false);
          return this._sendToDirectModel(userMessage);
        }

        if (!response.ok) {
          const err = (await response.json()) as { error?: string };
          console.error('Agent chat error:', err.error ?? 'Server error');
          return "I'm having trouble connecting right now. Could you tell me more about that?";
        }

        const data = (await response.json()) as { text?: string };
        return data.text ?? '';
      } catch (error) {
        console.error('Agent chat error:', error);
        return "I'm having trouble connecting right now. Could you tell me more about that?";
      }
    }

    // ── Direct model fallback ──────────────────────────────────────────────
    return this._sendToDirectModel(userMessage);
  }

  private async _sendToDirectModel(userMessage: string): Promise<string> {
    const history = this.messages();
    const firstUserIndex = history.findIndex((m) => m.role === 'user');

    let messagesToSend: { role: string; text: string }[];

    if (firstUserIndex === -1) {
      messagesToSend = [{ role: 'user', text: userMessage }];
    } else if (firstUserIndex > 0) {
      messagesToSend = [
        { role: 'user', text: '[START]' },
        ...history.map((m) => ({ role: m.role, text: m.text })),
      ];
    } else {
      messagesToSend = history
        .slice(firstUserIndex)
        .map((msg) => ({ role: msg.role, text: msg.text }));
    }

    try {
      const response = await fetch(`${environment.apiUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messagesToSend,
          cvText: this.cvText() || undefined,
        }),
      });

      if (!response.ok) {
        const err = (await response.json()) as { error?: string };
        console.error('Chat API error:', err.error ?? 'Server error');
        return "I'm having trouble connecting right now. Could you tell me more about that?";
      }

      const data = (await response.json()) as { text?: string };
      return data.text ?? '';
    } catch (error) {
      console.error('Chat API error:', error);
      return "I'm having trouble connecting right now. Could you tell me more about that?";
    }
  }

  private updateProtocolSignals(): void {
    const agentCount = this.messages().filter((m) => m.role === 'agent').length;
    this.protocolSignals.update((signals) => ({
      story: agentCount >= 1 ? true : signals.story,
      energy: agentCount >= 2 ? true : signals.energy,
      voice: agentCount >= 3 ? true : signals.voice,
      human_edge: agentCount >= 4 ? true : signals.human_edge,
      expertise: agentCount >= 5 ? true : signals.expertise,
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

  // ── Voice output ───────────────────────────────────────────────────────────

  private speakText(text: string): Promise<void> {
    return new Promise((resolve) => {
      const synth = window.speechSynthesis;
      if (!synth) {
        resolve();
        return;
      }

      synth.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.rate = 0.95;
      utt.pitch = 1.0;
      utt.volume = 1.0;
      this.isSpeaking.set(true);
      utt.onend = () => {
        this.isSpeaking.set(false);
        resolve();
      };
      utt.onerror = () => {
        this.isSpeaking.set(false);
        resolve();
      };
      synth.speak(utt);
    });
  }

  // ── Name confirmed (from ProcessingComponent) ──────────────────────────────

  onNameConfirmed(name: string): void {
    this.userName.set(name);
    this.nameConfirmed.set(true);
    this.showNamePrompt.set(false);
    void this.transitionToProcessing();
  }

  // ── Processing & generation ────────────────────────────────────────────────

  async transitionToProcessing(): Promise<void> {
    this.stopRecording();
    if (this.interviewMode() === 'sonic') {
      this.sonicService.stopSession();
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();

    // Tell the server the agent session is done so it clears CV injection state
    if (this.useAgent()) {
      void fetch(`${environment.apiUrl}/api/agent-chat/end-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: this.agentSessionId }),
      }).catch(() => { /* non-critical */ });
    }

    this.currentState.set('processing');

    try {
      // Step 1 — try to extract name from CV
      let resolvedName = '';

      if (this.cvText()) {
        this.processingStatus.set('Looking for your name…');
        try {
          const nameRes = await fetch(`${environment.apiUrl}/api/extract-name`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cvText: this.cvText() }),
          });
          const nameData = (await nameRes.json()) as { name: string | null };
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
          .filter((m) => m.role === 'user')
          .map((m) => m.text);
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

      const docRes = await fetch(`${environment.apiUrl}/api/generate-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: this.messages().map((m) => ({ role: m.role, text: m.text })),
          cvText: this.cvText() || undefined,
          userName: resolvedName || undefined,
        }),
      });

      if (!docRes.ok) {
        throw new Error('Document generation failed');
      }

      const docData = (await docRes.json()) as { document: string };

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
    await this.copyText(this.getDocumentText(), 'Copied. Drop this into any AI agent.');
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
      const response = await fetch(`${environment.apiUrl}/api/publish-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identityDocument: doc.raw,
          userName: doc.name,
          existingSlug: this.profileSlug() || undefined,
        }),
      });

      const data = (await response.json()) as {
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
