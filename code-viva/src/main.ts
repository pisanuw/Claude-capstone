import './ui/styles.css';
import { decodeViva } from './core/pack';
import { mountInstructor } from './ui/instructor';
import { mountStudent } from './ui/student';

const root = document.getElementById('app') as HTMLElement;
if (location.hash.startsWith('#viva=')) {
  document.title = 'Code Viva: your session';
  mountStudent(root, decodeViva(location.hash.slice(1)));
} else {
  mountInstructor(root);
}
