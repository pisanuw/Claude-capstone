import './ui/styles.css';
import { mountApp } from './ui/app';

const root = document.getElementById('app');
if (root) {
  mountApp(root);
  // A share link opened from within the page only changes the hash; re-mount
  // so the shared genome (or the editor, when the hash clears) renders.
  window.addEventListener('hashchange', () => mountApp(root));
}
