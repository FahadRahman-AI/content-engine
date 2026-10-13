// Builds the four starter pack PDFs (A4, one page each) into starter-pack/.
import { mkdir } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launchBrowser, escapeHtml as esc, headlineHtml } from '../src/render.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const tokens = await readFile(`${root}templates/tokens.css`, 'utf8');

const num = (i) => String(i).padStart(2, '0');
const lines = (n) => Array.from({ length: n }, () => '<div class="line"></div>').join('');

const field = (i, label, help, n = 1) =>
  `<section class="field"><div class="mono k">${num(i)}</div><div class="v"><h3>${esc(label)}</h3><p>${esc(help)}</p>${lines(n)}</div></section>`;

const DOCS = [
  {
    file: '1-claude-code-brief-template',
    label: 'TEMPLATE',
    title: 'The Claude Code *brief*',
    sub: 'Fill this in before you start a build. If you can\'t fill a line, you\'re not ready to build yet.',
    body: [
      field(1, 'Who is it for?', 'One sentence: the visitor, and what they already tried.'),
      field(2, 'The one action', 'Book a call, join the list, or buy. Pick one.'),
      field(3, "Sections, in order", "Top to bottom, one line each. A safe default: hero, proof, how it works, offer, FAQ, call to action.", 1),
      field(4, 'Real copy', 'Paste the actual headline, the actual offer and the actual price. Rough is fine. Placeholder text gives you placeholder pages.', 2),
      field(5, 'Visual rules', 'Two fonts, a few colours, one accent, a spacing scale. Save them in a file the agent reads every session (for example DESIGN.md).'),
      field(6, 'Done when', 'It works at 375px wide, every button goes somewhere, and the form reaches your inbox.'),
      `<div class="prompt"><div class="mono">PASTE-READY PROMPT</div><pre>You are building one page for [who it's for].
The only action is [the one action].
Sections in order: [sections].
Use this exact copy: [real copy].
Follow the visual rules in DESIGN.md.
Do not add sections, links or features I did not list.
Before you say you're done, check the page at 375px wide
and list anything that doesn't work.</pre></div>`,
    ].join(''),
  },
  {
    file: '2-pre-launch-checklist',
    label: 'CHECKLIST',
    title: 'Before you ship the site *Claude* built',
    sub: 'Fifteen boring checks. Run them before you post the link, not after someone DMs you a screenshot.',
    body: (() => {
      const groups = [
        ['Content', [['No lorem ipsum left anywhere', 'Search the page for "lorem" and "placeholder".'], ['Every button goes somewhere', 'Click each one. Twice.'], ['Prices match the checkout', 'Compare the page, the checkout and any emails.'], ['The contact email actually receives', 'Send yourself a test from a different address.']]],
        ['Mobile', [['Checked at 375px wide', 'Open dev tools, pick a phone size, scroll every section.'], ['Tap targets big enough for thumbs', 'Buttons and links you can hit without zooming.'], ['No sideways scroll', 'If the page wobbles left and right, something is too wide.'], ['Text readable without zooming', 'Body text, buttons and form labels.']]],
        ['Technical', [['Page title and description set', 'This is what shows in search and when shared.'], ['Share image shows up in a DM', 'Paste the link to yourself and look.'], ['Forms tested end to end', 'Submit it, then find the entry where it should land.'], ['Analytics fires once, not twice', 'One visit should count as one visit.']]],
        ['The human bit', [['Open it on someone else\'s phone', 'Their screen, their browser, their signal.'], ['Send it to one honest person', 'Ask what they thought the page wanted them to do.'], ['Read the headline out loud', 'If you stumble, rewrite it.']]],
      ];
      let n = 0;
      return groups
        .map(([g, items]) => `<section class="group"><div class="mono gh">${esc(g)}</div>${items.map(([t, h]) => `<div class="check"><span class="box"></span><div><b>${esc(t)}</b><span>${esc(h)}</span></div></div>`).join('')}</section>`)
        .join('');
    })(),
  },
  {
    file: '3-launch-page-outline',
    label: 'OUTLINE',
    title: 'One page. One *action*.',
    sub: 'The order of sections for a launch page, with a prompt to give Claude Code for each. Order is a decision, so don\'t let the model make it for you.',
    body: [
      ['Hero', 'Who it\'s for and what they get, in one headline.', 'Write three headline options for [who] who want [outcome]. Plain words, no hype, under 10 words each.'],
      ['Proof', 'Something real that shows you can do it. Only real work and facts you can verify. No proof yet? Show your process or a sample you made.', 'Turn these facts into three short proof points. Do not add numbers I didn\'t give you: [facts]'],
      ['How it works', 'Three steps a stranger understands.', 'Explain how [offer] works in three steps. One sentence each, no jargon.'],
      ['Offer', 'What\'s included, the price, and what happens next.', 'Write the offer block from this and nothing else: what\'s included, price, timeline: [details]'],
      ['FAQ', 'The questions a hesitant buyer asks: price, timing, "is this for me?"', 'List the five questions a hesitant buyer would ask and answer them using only these facts: [facts]'],
      ['Call to action', 'Repeat the one action. Nothing new.', 'Write the closing call to action for [the one action]. One sentence and one button label.'],
    ]
      .map(([n, job, prompt], i) => `<section class="row"><div class="mono k">${num(i + 1)}</div><div class="v"><h3>${esc(n)}</h3><p>${esc(job)}</p><div class="pr"><span class="mono">PROMPT</span>${esc(prompt)}</div></div></section>`)
      .join(''),
  },
  {
    file: '4-first-ask-worksheet',
    label: 'WORKSHEET',
    title: 'Get to the first *ask*',
    sub: 'Do this before you build the next feature. If you\'re polishing the logo instead, that\'s the sign.',
    body: [
      field(1, 'One real person', 'Name one actual person who has the problem. Not "founders". A name.'),
      field(2, 'Their problem, in their words', 'Whatever they\'d say out loud, not your product description.'),
      `<section class="field"><div class="mono k">03</div><div class="v"><h3>The ask</h3><p>Copy, edit, send. No pitch.</p><div class="prompt"><pre>Hi [name], I'm working on [thing] to help [type of person]
with [problem]. Would you be open to a 10-minute chat about
how you handle it today? No pitch, I just want to learn.</pre></div></div></section>`,
      `<section class="field"><div class="mono k">04</div><div class="v"><h3>Send it to five people today</h3><p>Track what happens.</p>
<table><thead><tr><th>Name</th><th>Sent</th><th>Replied</th><th>What they said</th></tr></thead><tbody>${'<tr><td></td><td></td><td></td><td></td></tr>'.repeat(5)}</tbody></table></div></section>`,
      field(5, 'The sentence that surprised you', 'After each conversation, write the one thing they said that you didn\'t expect.'),
      '<p class="rule-line">No new feature until you\'ve had a real conversation.</p>',
    ].join(''),
  },
];

const css = `${tokens}
@page { size: A4; margin: 0 }
body { margin: 0 }
.page { width: 794px; min-height: 1123px; padding: 44px 60px 56px; box-sizing: border-box; position: relative; background: var(--bg); color: var(--ink); font-family: var(--font-head); }
.top { display: flex; justify-content: space-between; color: var(--ink); margin-bottom: 26px; }
h1 { font-size: 46px; margin: 0 0 10px; }
h1 em { color: var(--accent); }
.sub { font-size: 17px; line-height: 1.4; color: var(--muted); max-width: 560px; margin: 0 0 16px; font-weight: 500; }
.rule { height: 1px; background: var(--ink); margin: 0 0 6px; }
h3 { font-size: 20px; letter-spacing: -0.02em; margin: 0 0 3px; font-weight: 700; }
p { margin: 0 0 8px; font-size: 14px; line-height: 1.4; color: var(--muted); font-weight: 500; }
.field, .row { display: flex; gap: 20px; padding: 10px 0 4px; }
.k { color: var(--muted); width: 28px; flex: none; padding-top: 5px; }
.v { flex: 1; }
.line { border-bottom: 1px solid rgba(20,20,20,.35); height: 22px; }
.prompt { margin-top: 14px; }
.prompt .mono { color: var(--muted); margin-bottom: 8px; }
pre { margin: 0; font-family: var(--font-mono); font-size: 12.5px; line-height: 1.6; white-space: pre-wrap; padding: 14px 0; border-top: 1px solid var(--ink); border-bottom: 1px solid rgba(20,20,20,.35); }
.group { margin-bottom: 8px; } .gh { color: var(--accent); margin: 6px 0 2px; }
.check { display: flex; gap: 14px; align-items: flex-start; padding: 5px 0; border-bottom: 1px solid rgba(20,20,20,.15); }
.box { width: 16px; height: 16px; border: 1.5px solid var(--ink); flex: none; margin-top: 3px; }
.check b { display: block; font-size: 15.5px; font-weight: 700; letter-spacing: -0.01em; }
.check span:not(.box) { display: block; font-size: 12.5px; color: var(--muted); font-weight: 500; }
.pr { font-family: var(--font-mono); font-size: 12px; line-height: 1.55; padding: 10px 0 2px; border-top: 1px solid rgba(20,20,20,.35); }
.pr .mono { color: var(--accent); margin-right: 10px; }
table { width: 100%; border-collapse: collapse; margin-top: 4px; table-layout: fixed; }
th:nth-child(1) { width: 24%; } th:nth-child(2), th:nth-child(3) { width: 12%; }
th { font-family: var(--font-mono); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; text-align: left; font-weight: 400; color: var(--muted); padding: 4px 6px 6px 0; border-bottom: 1px solid var(--ink); }
td { height: 30px; border-bottom: 1px solid rgba(20,20,20,.3); }
.rule-line { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; color: var(--ink); margin: 20px 0 0; }
.foot { position: absolute; left: 60px; right: 60px; bottom: 28px; display: flex; justify-content: space-between; color: var(--muted); font-size: 12px; }
`;

const html = (d) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="page">
<div class="top mono"><span>FORWARD THINKING CO / STARTER PACK</span><span>${d.label}</span></div>
<h1 class="headline">${headlineHtml(d.title)}</h1><p class="sub">${esc(d.sub)}</p><div class="rule"></div>
${d.body}
<div class="foot mono"><span>@forwardthinkingco</span><span>Free starter pack</span></div></div></body></html>`;

await mkdir(`${root}starter-pack`, { recursive: true });
const browser = await launchBrowser();
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 794, height: 1123 });
  for (const d of DOCS) {
    await page.setContent(html(d), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const h = await page.evaluate(() => document.querySelector('.page').scrollHeight);
    await page.pdf({ path: `${root}starter-pack/${d.file}.pdf`, width: '794px', height: '1123px', printBackground: true, pageRanges: '1' });
    await page.screenshot({ path: `${root}out/starter-${d.file}.png`, clip: { x: 0, y: 0, width: 794, height: Math.max(1123, h) } });
    console.log(`${d.file}: content height ${h}px ${h > 1123 ? '(OVERFLOWS one page!)' : 'ok'}`);
  }
} finally {
  await browser.close();
}
