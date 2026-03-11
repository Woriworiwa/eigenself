import {
  Component,
  ChangeDetectionStrategy,
  signal,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ElementRef,
  viewChildren,
} from '@angular/core';
import { NgClass } from '@angular/common';

const SECTIONS = [
  { id: 'inspiration',    label: 'Inspiration' },
  { id: 'what-it-does',  label: 'What It Does' },
  { id: 'how-i-built',   label: 'How I Built It' },
  { id: 'challenges',    label: 'Challenges' },
  { id: 'proud-of',      label: 'Accomplishments' },
  { id: 'learned',       label: 'What I Learned' },
  { id: 'whats-next',    label: "What's Next" },
];

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [NgClass],
  templateUrl: './about.component.html',
  styleUrl: './about.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutComponent implements AfterViewInit, OnDestroy {
  readonly sections = SECTIONS;
  activeId = signal<string>('inspiration');

  private observer!: IntersectionObserver;

  ngAfterViewInit(): void {
    this.observer = new IntersectionObserver(
      (entries) => {
        // pick the topmost visible section
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          this.activeId.set(visible[0].target.id);
        }
      },
      { rootMargin: '-10% 0px -70% 0px', threshold: 0 }
    );

    SECTIONS.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) this.observer.observe(el);
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  scrollTo(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
