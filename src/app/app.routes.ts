import { Routes } from '@angular/router';
import { WelcomeComponent } from './welcome/welcome.component';
import { InterviewComponent } from './interview/interview.component';
import { AboutComponent } from './about/about.component';

export const routes: Routes = [
  { path: '', component: WelcomeComponent },
  { path: 'interview', component: InterviewComponent },
  { path: 'about', component: AboutComponent },
  { path: '**', redirectTo: '' },
];
