import {
  Component,
  input,
  output,
  ChangeDetectionStrategy,
} from '@angular/core';
import { IdentityDocument } from '../interview.types';

@Component({
  selector: 'app-reveal',
  templateUrl: './reveal.component.html',
  styleUrl: './reveal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RevealComponent {
  identityDoc = input<IdentityDocument | null>(null);
  copyConfirmation = input<string>('');
  profileUrl = input<string>('');
  profilePublishing = input<boolean>(false);
  profilePublishError = input<string>('');
  profileUrlCopied = input<boolean>(false);

  copyDocumentClicked = output<void>();
  downloadDocumentClicked = output<void>();
  publishProfileClicked = output<void>();
  copyProfileUrlClicked = output<void>();
}
