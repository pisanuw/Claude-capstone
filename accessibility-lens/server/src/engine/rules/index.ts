import type { Rule } from '../types.js';
import { imgAltRule } from './imgAlt.js';
import { htmlLangRule } from './htmlLang.js';
import { docTitleRule } from './docTitle.js';
import { formLabelRule } from './formLabel.js';
import { headingOrderRule } from './headingOrder.js';
import { linkTextRule } from './linkText.js';
import { buttonNameRule } from './buttonName.js';
import { viewportZoomRule } from './viewportZoom.js';
import { duplicateIdRule } from './duplicateId.js';
import { positiveTabindexRule } from './positiveTabindex.js';
import { contrastRule } from './contrast.js';

/**
 * The ordered list of all rules the engine runs. Adding a rule here is the
 * only wiring needed; analyze.ts iterates this array.
 */
export const ALL_RULES: Rule[] = [
  imgAltRule,
  htmlLangRule,
  docTitleRule,
  formLabelRule,
  headingOrderRule,
  linkTextRule,
  buttonNameRule,
  viewportZoomRule,
  duplicateIdRule,
  positiveTabindexRule,
  contrastRule,
];
