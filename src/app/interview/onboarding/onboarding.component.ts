import {
  Component,
  input,
  output,
  signal,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import { InterviewMode } from '../interview.types';

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

  readonly onboardingParagraphs: string[] = [
    "Before we start — I want to tell you what this is, and what it isn't.",
    'I am not going to ask you to list your skills or summarise your experience. I have read enough CVs. I am more interested in how you actually think, what lights you up, and what makes you different from everyone with the same job title.',
    'We are going to have a real conversation. I will ask you things. You answer however feels natural — there is no script, no right answer, no way to get this wrong.',
    'At the end, I will build something that captures who you actually are — not just what you have done.',
    "When you are ready — tell me how you'd like to talk.",
  ];

  visibleParagraphs = signal<number>(0);
  onboardingComplete = signal<boolean>(false);

  ngOnInit(): void {
    this.startOnboardingAnimation();
  }

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
}
