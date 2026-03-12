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

      &--github {
        display: flex;
        align-items: center;
        color: var(--ink-4);
        &:hover { color: var(--ink); }
      }
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
        @if (isHome()) {
          <a routerLink="/about" class="a-nav-link">The Story</a>
          <a href="https://github.com/Woriworiwa/eigenself" target="_blank" rel="noopener" class="a-nav-link a-nav-link--github" aria-label="GitHub">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.342-3.369-1.342-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836a9.59 9.59 0 012.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.744 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
            </svg>
          </a>
        }
        @if (isStory()) {
          <a routerLink="/" class="a-nav-link">← Home</a>
        }
        @if (isInterview()) {
          <a routerLink="/" class="a-btn-start">← Start over</a>
        }
      </div>
    </nav>
    <router-outlet />
  `,
})
export class App {
  private router = inject(Router);

  isHome(): boolean {
    return this.router.url === '/' || this.router.url === '';
  }

  isStory(): boolean {
    return this.router.url === '/about';
  }

  isInterview(): boolean {
    return this.router.url.startsWith('/interview');
  }
}
