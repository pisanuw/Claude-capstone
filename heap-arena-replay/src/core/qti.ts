// Canvas-importable QTI 1.2 package: one short-answer question per quiz item.

import type { HeapConfig } from './heap';
import { policyLabel } from './trace';
import type { Question } from './quiz';
import { buildZip } from './zip';

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function itemXml(q: Question, ident: string): string {
  const body =
    `<p>${escapeXml(q.prompt)}</p>` +
    `<p>Allocator: ${escapeXml(q.policy)}.</p>` +
    `<pre>${escapeXml(q.context)}</pre>`;
  const conds = q.accepted
    .map((a) => `<varequal respident="response1">${escapeXml(a)}</varequal>`)
    .join('');
  return [
    `    <item ident="${ident}" title="Question ${q.n}">`,
    '      <itemmetadata><qtimetadata>',
    '        <qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>short_answer_question</fieldentry></qtimetadatafield>',
    '        <qtimetadatafield><fieldlabel>points_possible</fieldlabel><fieldentry>1.0</fieldentry></qtimetadatafield>',
    '      </qtimetadata></itemmetadata>',
    '      <presentation>',
    `        <material><mattext texttype="text/html">${escapeXml(body)}</mattext></material>`,
    '        <response_str ident="response1" rcardinality="Single"><render_fib><response_label ident="answer1" rshuffle="No"/></render_fib></response_str>',
    '      </presentation>',
    '      <resprocessing>',
    '        <outcomes><decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/></outcomes>',
    `        <respcondition continue="No"><conditionvar><or>${conds}</or></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition>`,
    '      </resprocessing>',
    `      <itemfeedback ident="general_fb"><flow_mat><material><mattext texttype="text/html">${escapeXml(`<p>${escapeXml(q.explanation)}</p>`)}</mattext></material></flow_mat></itemfeedback>`,
    '    </item>',
  ].join('\n');
}

export function assessmentXml(qs: Question[], cfg: HeapConfig, ident: string, title: string): string {
  const items = qs.map((q, i) => itemXml(q, `${ident}_q${i + 1}`)).join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/ims_qtiasiv1p2 http://www.imsglobal.org/xsd/ims_qtiasiv1p2p1.xsd">',
    `  <assessment ident="${ident}" title="${escapeXml(title)}">`,
    '    <qtimetadata><qtimetadatafield><fieldlabel>cc_maxattempts</fieldlabel><fieldentry>1</fieldentry></qtimetadatafield></qtimetadata>',
    '    <section ident="root_section">',
    `    <!-- ${escapeXml(policyLabel(cfg))}, ${cfg.word}-byte words, ${cfg.heapSize}-byte heap -->`,
    items,
    '    </section>',
    '  </assessment>',
    '</questestinterop>',
    '',
  ].join('\n');
}

export function manifestXml(ident: string, title: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<manifest identifier="${ident}_manifest" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1" xmlns:lom="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/resource" xmlns:imsmd="http://www.imsglobal.org/xsd/imsmd_v1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`,
    '  <metadata><schema>IMS Content</schema><schemaversion>1.1.3</schemaversion>',
    `    <imsmd:lom><imsmd:general><imsmd:title><imsmd:string>${escapeXml(title)}</imsmd:string></imsmd:title></imsmd:general></imsmd:lom>`,
    '  </metadata>',
    '  <organizations/>',
    '  <resources>',
    `    <resource identifier="${ident}" type="imsqti_xmlv1p2"><file href="${ident}/${ident}.xml"/></resource>`,
    '  </resources>',
    '</manifest>',
    '',
  ].join('\n');
}

export function buildQtiPackage(qs: Question[], cfg: HeapConfig, title = 'Heap Arena Replay quiz'): Uint8Array {
  const ident = 'heap_arena_' + Math.abs(hash(title + qs.map((q) => q.answer).join('|'))).toString(16);
  return buildZip([
    { name: 'imsmanifest.xml', data: manifestXml(ident, title) },
    { name: `${ident}/${ident}.xml`, data: assessmentXml(qs, cfg, ident, title) },
  ]);
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}
