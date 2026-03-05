import { Component, inject } from '@angular/core';
import { Router, RouterOutlet, RouterLink } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  styles: [`
    :host { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

    .a-nav {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--sp-6) var(--sp-8);
      border-bottom: 1px solid var(--line-soft);
      background: var(--bg);
      flex-shrink: 0;
    }

    .a-wordmark {
      font-family: var(--font-display);
      font-size: 1.05rem;
      font-weight: 500;
      font-style: italic;
      letter-spacing: -0.01em;
      color: var(--ink-2);
      text-decoration: none;
      cursor: pointer;
      transition: color 0.15s;
      &:hover { color: var(--ink); }
    }

    .a-nav-actions {
      display: flex;
      align-items: center;
      gap: var(--sp-6);
    }

    .a-nav-link {
      font-size: 0.875rem;
      color: var(--ink-3);
      text-decoration: none;
      transition: color 0.15s;
      &:hover { color: var(--ink); }
    }

    .a-btn-start {
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--line);
      border-radius: var(--r-full);
      font-family: var(--font-body);
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--ink-3);
      background: transparent;
      padding: 0.5rem 1.1rem;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.15s;
      &:hover { color: var(--ink); border-color: var(--ink-5); background: var(--bg-warm); }
    }
  `],
  template: `
    <nav class="a-nav">
      <a class="a-wordmark" routerLink="/">eigenself</a>
      <div class="a-nav-actions">
        @if (isWelcome()) {
          <a href="#how-it-works" class="a-nav-link">How it works</a>
        }
        @if (!isWelcome()) {
          <a routerLink="/" class="a-btn-start">← Start over</a>
        }
      </div>
    </nav>
    <router-outlet />
  `,
})
export class App {
  private router = inject(Router);

  isWelcome(): boolean {
    return this.router.url === '/' || this.router.url === '';
  }
}
