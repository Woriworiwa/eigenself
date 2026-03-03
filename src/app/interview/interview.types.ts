export type AppState = 'onboarding' | 'interview' | 'processing' | 'reveal';
export type InterviewMode = 'sonic' | 'voice-text' | 'text';

export interface IdentityDocument {
  raw: string;
  name: string;
  generated: string;
}

export interface Message {
  role: 'agent' | 'user';
  text: string;
  timestamp: Date;
}

export interface ProtocolSignals {
  story: boolean;
  energy: boolean;
  voice: boolean;
  human_edge: boolean;
  expertise: boolean;
}
