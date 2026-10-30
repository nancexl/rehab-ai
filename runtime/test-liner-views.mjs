// Static guards for the two entry views on /liner.html: the crutch user view can never approve a build.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const d = new URL('../dist/', import.meta.url);
const html = readFileSync(new URL('liner.html', d), 'utf8'), views = readFileSync(new URL('liner-views.js', d), 'utf8'), app = readFileSync(new URL('liner.js', d), 'utf8');
let n = 0; const t = (name, f) => { f(); n++; console.log('ok -', name); };
const crutch = html.slice(html.indexOf('>', html.indexOf('id="patientView"')) + 1, html.indexOf('id="techView"'));
t('story is labelled illustrative and sits above the tool', () => { assert.match(html, /Illustrative composite persona/); assert.ok(html.indexOf('id="story"') < html.indexOf('id="techView"')); });
t('flow diagram has five steps with human approval', () => { const f = html.slice(html.indexOf('class="flow"'), html.indexOf('</ol>', html.indexOf('class="flow"'))); assert.equal((f.match(/<li/g) || []).length, 5); assert.match(f, /Human approves/); });
t('crutch user view has no approve control', () => { assert.ok(crutch.length > 500); assert.doesNotMatch(crutch, /approveBtn|>Approve/); });
t('crutch user view script never touches approval', () => { assert.doesNotMatch(views, /approveBtn|approved\s*=\s*true|userActed\s*=\s*true/); assert.match(views, /Send to your clinician\/technician for review/); });
t('handoff to technician arrives unapproved', () => { assert.match(app, /loadFromPatient\(.*S\.userActed = false; run\(\)/); });
t('no "patient" wording in visible crutch-view copy', () => { assert.doesNotMatch(crutch.replace(/<[^>]+>/g, ' '), /patient/i); });
console.log(`${n}/6 view tests passed`);
