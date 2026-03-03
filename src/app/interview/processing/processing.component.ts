import {
  Component,
  input,
  output,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';

@Component({
  selector: 'app-processing',
  templateUrl: './processing.component.html',
  styleUrl: './processing.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProcessingComponent {
  showNamePrompt = input<boolean>(false);
  processingStatus = input<string>('');

  nameConfirmed = output<string>();

  nameInput = signal<string>('');

  onNameInput(event: Event): void {
    this.nameInput.set((event.target as HTMLInputElement).value);
  }

  handleNameKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.confirmName();
    }
  }

  confirmName(): void {
    const name = this.nameInput().trim();
    if (!name) return;
    this.nameConfirmed.emit(name);
  }
}
