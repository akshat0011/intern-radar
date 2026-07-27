# Chapter 3 — The Page: HTML, CSS, and the DOM

> By the end you can read `web/public/index.html` and `web/public/styles.css` line by line, explain why the job list ships empty, and defend two real layout bugs this project shipped and fixed.

**New words:** markup, tag, element, attribute, nesting, document tree, head, body, semantic element, block, inline, id, class, screen reader, ARIA, `tabindex`, skip link, selector, specificity, cascade, box model, flexbox, grid, sticky, custom property, media query, DOM, `textContent`, `innerHTML`, XSS, event, bubbling, delegation, layout, reflow, paint.

---

## 3.1 Three languages, one page

**HTML** (HyperText Markup Language) says *what is on the page*. **Markup** means ordinary text with labels wrapped around parts of it so a machine knows what each part is. **CSS** (Cascading Style Sheets) says *what it looks like*. **JavaScript** says *what it does* when you click or type; it works on the **DOM** (Document Object Model), the browser's live in-memory copy of the page.

Intern Radar has no framework — no React, no Tailwind. One HTML file (210 lines), one CSS file (550 lines), one JavaScript file (825 lines). There is **no build step**: the file you edit is the byte-for-byte file the browser downloads. So everything in this chapter is verifiable by opening the site and viewing source.

---

## 3.2 HTML: elements, attributes, a tree

A **tag** is a name in angle brackets. `<p>` opens a paragraph, `</p>` closes it. Opening tag, closing tag, and everything between is one **element**. An **attribute** is extra information inside the opening tag, written `name="value"`:

```html
<p class="role">Software Engineering Intern</p>
```

Some elements have no content and never close: `<meta charset="utf-8">`, `<input>`, `<img>`.

**Nesting** means elements inside elements, closed innermost-first. Because nesting is strict, the document forms a **document tree**: every element has exactly one parent. It is a hostel address — block, floor, room, bed. The root is `<html>`, with exactly two children: **`<head>`** (information *about* the page, invisible) and **`<body>`** (everything you see).

**Block** elements start a new line and fill the width — `<div>`, `<p>`, `<h1>`, `<ol>`, `<section>`. **Inline** elements sit inside a line of text — `<span>`, `<a>`, `<strong>`, `<b>`, `<i>`. Those are defaults only; CSS overrides them constantly.

**`id` versus `class`.** An `id` must be unique in the page; a `class` can be reused, and one element can carry several. This project keeps a strict convention: **`id` is the JavaScript handle, `class` is the CSS handle.** `app.js` opens with a helper for exactly that:

```js
const $ = (id) => document.getElementById(id);
```

`web/public/app.js:9`. Every `$('joblist')`, `$('reset')` reaches for an `id`, while `styles.css` styles `.row`, `.elig`, `.skill` and almost never an `id`. Two separate namespaces means renaming a CSS class cannot break JavaScript.

**Forms.** `<input type="search">` is a one-line box, `<select>` a dropdown whose choices are `<option>`s, `<textarea>` a multi-line box, `<button type="button">` a button that waits for JavaScript. `<label>` ties a caption to a control; when the control sits *inside* the label — as here — the association is automatic and the caption becomes clickable. Note `type="button"` on every button in `index.html`: a `<button>` defaults to submit, which reloads the page.

---

## 3.3 Semantics and accessibility

A **semantic element** states its meaning by name: `<header>`, `<main>`, `<section>`, `<article>`, `<aside>`, `<footer>`, `<ol>`. `<div>` and `<span>` mean nothing.

You could build any page from `<div>`s alone and make it look identical. It would be worse. A **screen reader** — software that reads a page aloud for a blind user, driven by the keyboard — does not see your page. It walks the tree and announces what it finds. `<h1>` is announced as a heading and can be jumped to; a `<div>` styled to look like one is announced as nothing. Search engines read the same tree. And browsers give semantic elements free behaviour: `<button>` is focusable, activates on Enter *and* Space, and announces itself.

**ARIA** (Accessible Rich Internet Applications) adds meaning HTML cannot express:

- **`role`** — what it is: `role="tablist"`, `role="tab"`, `role="dialog"`, `role="button"`.
- **`aria-selected`** — which tab is open. **`aria-pressed`** — whether a toggle is on. **`aria-current="true"`** — which item you are on now.
- **`aria-label`** — a text name for an icon-only control. **`aria-hidden="true"`** — hide decoration from screen readers. **`aria-live="polite"`** — announce changes without interrupting.

First rule of ARIA: do not use ARIA if a plain element already does the job.

**`tabindex`** controls what the Tab key lands on. `tabindex="0"` puts an element in the natural order; `-1` makes it focusable only by JavaScript; positive numbers jump the queue and are almost always a mistake.

A **skip link** is a link, first in the body, that jumps past the header to the content. It is hidden until focused, so a keyboard user gets it on the first Tab instead of tabbing through the whole header.

---

## 3.4 Reading the real `index.html`

```html
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Intern Radar — be early</title>
<meta name="color-scheme" content="dark light">
<link rel="canonical" href="https://www.internradar.online/">
```

`web/public/index.html:4-9`.

- `charset` tells the browser how to turn bytes into characters. It must land in the first 1024 bytes, which is why it is line 4.
- **viewport** tells a phone to lay out at its real width, not a pretend 980px. Without it every responsive rule in the stylesheet is ignored on mobile.
- `color-scheme: dark light` tells the browser the page handles both, so native scrollbars and form controls match instead of drawing white boxes on black.
- **canonical** names the one true URL, so `internradar.online`, `www.…` and URLs with tracking parameters are not indexed as three duplicate pages.

Then a block of `og:` and `twitter:` tags — Open Graph, the metadata WhatsApp, iMessage and Slack read to build a preview card. The file explains a real incident in a comment at lines 11-15: `og:image` must be an **absolute** https URL or it is silently dropped, and crawlers cache hard and key on the image URL — which is why line 21 reads `og.jpg?v=2`. Chapter 2, *How the Web Actually Works*, covers the DNS failure behind it.

### A favicon with no file

```html
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='22' fill='%230b0b0c'/><circle cx='50' cy='50' r='30' fill='none' stroke='%23c8ff00' stroke-width='7'/><circle cx='50' cy='50' r='9' fill='%23c8ff00'/></svg>">
```

`web/public/index.html:37`. A **data URI** is a URL containing the file instead of pointing at one. So the tab icon is drawn from the HTML itself — no `favicon.ico`, no extra network request. Two details: single quotes inside, because the whole value sits in double quotes; and `#` written `%23`, because `#` in a URL starts a fragment and would cut the image in half.

### Skip link and grain

```html
<a class="skip" href="#results">Skip to listings</a>
<div class="grain" aria-hidden="true"></div>
```

`web/public/index.html:46-47`. The skip link is first in the body, targeting `id="results"`. Its CSS:

```css
.skip { position: absolute; left: -9999px; }
.skip:focus { left: 0; top: 0; z-index: 1000; background: var(--live); color: var(--live-ink); padding: 10px 16px; }
```

`web/public/styles.css:90-91`. Parked off-screen, snapped back on focus. It is *moved*, not `display: none` — a `display: none` element cannot receive focus, so the link would never appear. `.grain` is a decorative film-grain texture, so `aria-hidden="true"` removes it from the screen reader's world entirely.

### The tabs

```html
<div class="seg" role="tablist" aria-label="Role type">
  <button class="seg-b" id="tab-tech" role="tab" aria-selected="true" data-tech="1">Engineering <b id="n-tech">0</b></button>
  <button class="seg-b" id="tab-other" role="tab" aria-selected="false" data-tech="0">Everything else <b id="n-other">0</b></button>
</div>
```

`web/public/index.html:91-94`. Real `<button>` elements, so keyboard behaviour is free. And `aria-selected` is not decoration — it is the styling hook:

```css
.seg-b[aria-selected="true"] { background: var(--live); color: var(--live-ink); }
```

`web/public/styles.css:182`. **The accessibility attribute is the single source of truth for the state.** There is no separate `.active` class that can drift out of sync; set `aria-selected`, and the paint follows. Same trick on the filter chips (`.flag[aria-pressed="true"]`, line 216) and the selected row (`.row[aria-current="true"]`, line 256). `data-tech="1"` is a **data attribute** — any `data-` attribute is legal HTML, read back as `element.dataset.tech`.

### The filters, and the empty list

```html
<div class="picks">
  <label><span>company</span><select id="f-company"><option value="">any</option></select></label>
  <label><span>city</span><select id="f-location"><option value="">any</option></select></label>
  …
</div>
```

`web/public/index.html:102-107`. Company and city ship with one `<option>` — "any" — because the real values are unknown until the JSON loads. Mode and order are fixed sets, written out in HTML. Remember these four labels; they are the site of the first bug.

```html
<ol class="feed" id="joblist"></ol>
```

`web/public/index.html:120`. That is the entire job list in the file that ships. `<ol>` and not `<div>` because the order is meaningful — sorted by newest or by stipend, with a real rank number in each row.

---

## 3.5 What that emptiness costs

Everything visible is built by JavaScript after load. An interviewer will ask the price.

**Search engines.** Google runs JavaScript, on a delay and a budget. Most other crawlers — including the WhatsApp, Slack and LinkedIn preview bots — do not. They fetch the HTML, find an empty `<ol>`, and index a page with no jobs. The project mitigates this exactly once, deliberately: the `og:` tags are static text, so share cards are correct even when the listings are invisible to the bot. Individual postings are not indexable at all.

**Users without JavaScript.** A script blocker, a corporate proxy, or a failed download of `app.js` leaves a header and the word "loading" forever. There is no `<noscript>` fallback.

The honest defence is that the alternative costs more. Rendering listings into the HTML needs either a server running on every request or a build step regenerating the file when data changes. This project has neither, on purpose — static files on Vercel, fed by one JSON file the watcher commits to git (Chapter 9, *Shipping It*). Client-side rendering is the price of no server and no build. Say the price; do not pretend it is free.

---

## 3.6 CSS: selectors, the cascade, the box

```css
.skill { font-size: 10px; color: var(--ink-2); }
```

The **selector** (`.skill`) picks elements; the declarations set `property: value`. Selectors include `p` (element), `.row` (class), `#joblist` (id), `[hidden]` (attribute present), `.seg-b[aria-selected="true"]` (attribute value), `.picks select` (descendant), `.seg-b + .seg-b` (immediate sibling), `:hover`, `:focus-visible`, `::before`.

`::before` and `::after` are **pseudo-elements** — an extra box invented by CSS with no HTML behind it. `.row::before` (`web/public/styles.css:250`) draws the 2px strip on a row's left edge that turns lime when selected. No markup, one rule.

### Specificity and the cascade

When two rules set the same property on one element, the **cascade** decides, in order: `!important` first; then **specificity**, counted as ids, then classes/attributes/pseudo-classes, then element names, compared left to right; then **source order**, later wins.

That last rule does real work here. `.rail { position: sticky }` at line 161 and `.rail { position: static }` at line 528 have identical specificity, so the later one wins whenever its media query applies. Moving the responsive blocks up the file would silently break mobile.

The file has one `!important`:

```css
[hidden] { display: none !important; }
```

`web/public/styles.css:53`. HTML's `hidden` attribute has almost no specificity, so any class setting `display: flex` beats it. This line guarantees that `$('empty').hidden = true` in JavaScript actually hides the element. That is the legitimate use of `!important`: enforcing an invariant, not winning an argument you started.

### The box model

Every element is a rectangle in four layers: **content**, **padding** (inside the border), **border**, **margin** (outside, pushing others away). The trap: by default `width: 200px` sizes the *content*, with padding and border added on top, so the box is really 234px. Every real project turns that off in line one:

```css
*, *::before, *::after { box-sizing: border-box; }
```

`web/public/styles.css:52`. Now `width` includes padding and border.

---

## 3.7 Layout: display, position, flex, grid, variables

**`display`** decides how a box lays out its children: `block`, `inline`, `none` (removed, no space reserved), `flex`, `grid`.

**`position`**: `static` (default, normal flow); `relative` (in flow, nudged, and an anchor for absolute children); `absolute` (out of flow, placed against the nearest positioned ancestor); `fixed` (out of flow, placed against the viewport, ignores scrolling); **`sticky`** (static until it would scroll past a `top` you set, then fixed until its parent scrolls away). Sticky is the corridor notice board that follows you down the corridor and vanishes when you leave it. Without a `top` value it does nothing.

**Flexbox** (`display: flex`) lays children in one direction and shares leftover space: `gap`, `align-items`, `justify-content`, `flex-wrap: wrap`. On a child, `flex: 1 1 240px` is grow, shrink, basis.

**Grid** (`display: grid`) lays children in rows *and* columns. The job row:

```css
grid-template-columns: 24px 42px minmax(0,1fr) auto;
```

`web/public/styles.css:237`. A 24px rank, a 42px logo, a flexible middle, and a right column sized to content. `1fr` is one share of leftover space; `minmax(0,1fr)` is the same but allowed to shrink to zero — the grid form of the trap in section 3.8.

**Units.** `px` absolute; `em` relative to the element's font size, `rem` to the root's; `%` to the parent; `vw`/`vh` 1% of viewport width/height; `ch` the width of a "0" — `max-width: 66ch` on `.gist-list` (line 312) sets a reading measure without caring about the font. `clamp(26px, 3.4vw, 38px)` on the headline (line 151) scales with the viewport but never below 26px or above 38px.

**Colours.** Hex, `rgba()`, and `color-mix(in oklab, var(--live) 42%, transparent)` — blending two colours in a perceptually even space, used throughout so one accent colour yields a family of borders at different strengths.

**Custom properties** are user-defined properties starting with `--`, read with `var()`. They inherit down the tree, which makes them the whole theming system:

```css
:root {
  --ink:  #f2f2ec;
  --bg:   #0a0a0b;
  --live: #c8ff00;   /* the one loud colour. never a gradient. */
  --bar-h:   62px;
  /* Replaced at runtime by syncStickyOffset(); this is only the first paint. */
  --stack-h: 152px;
}
:root[data-theme="light"] { --ink: #131311; --bg: #f4f3ee; --live: #5d7a00; }
```

`web/public/styles.css:7-50`, trimmed. `:root` is `<html>`. Every rule says `color: var(--ink)`, never a literal. Light theme redefines the same names under one attribute selector and the whole site repaints. JavaScript switches themes with one line — `document.documentElement.dataset.theme = next` (`web/public/app.js:40`) — saved to `localStorage`.

Note `--live` changes from `#c8ff00` to `#5d7a00` in light mode. Acid lime on black reads; the same lime on cream does not. Same variable, different value, contrast preserved.

**Media queries** apply rules under a condition: `@media (max-width: 680px)` tests width; `@media (prefers-reduced-motion: reduce)` respects an OS accessibility setting and cuts every animation to 0.001ms (lines 535-538), because motion causes real nausea for some people; `@media print` hides the whole site and leaves only `.sheet`, which is how the tailored résumé prints cleanly.

### The sticky stack and `--stack-h`

```css
.bar  { position: sticky; top: 0;            z-index: 60; height: var(--bar-h); }
.rail { position: sticky; top: var(--bar-h); z-index: 50; }
```

`web/public/styles.css:96, 161`. The header pins to the top; the filter rail pins directly below it by starting at exactly the header's height. `z-index` decides which is in front when boxes overlap.

Everything that must clear both reads one variable:

```css
.row      { scroll-margin-top: calc(var(--stack-h) + 16px); }
.pane-col { position: sticky; top: calc(var(--stack-h) + 16px); }
.pane     { max-height: calc(100vh - var(--stack-h) - 44px); }
```

Lines 235, 349, 364. `scroll-margin-top` reserves space above an element when the browser scrolls it into view — without it, jumping to `#job-123` lands the row under the header. Section 3.12 shows where the real value of `--stack-h` comes from.

---

## 3.8 Bug one: the page that scrolled sideways

On a phone the whole site scrolled left and right — about 150 pixels of dead space, and every vertical swipe drifted.

The cause was the four filter dropdowns. `.picks select` had `flex: 1` and no `min-width`. Here is the rule almost nobody knows:

**A flex item's default `min-width` is `auto`, not `0`.** `auto` means "your intrinsic minimum content width" — the narrowest you can be without your content overflowing. For a `<select>`, that is the width of its widest `<option>`. The company dropdown is filled at runtime from real company names, so one long name sets a floor that `flex: 1` cannot push below. Four of them side by side and the rail is wider than the phone; the page grows to contain it. It is a mess-hall table that refuses to be pushed narrower than its longest tray, however small the room gets.

The first attempted fix was the obvious one:

```css
body { overflow-x: hidden; }
```

Still at `web/public/styles.css:66`. It did nothing. Horizontal overflow on `body` only clips if the browser treats `body` as the scrolling box, and `html` was still `overflow-x: visible`, so the page kept its own horizontal scroll and the rule was a no-op. The lesson generalises: **`overflow: hidden` hides a symptom, it does not remove a box that is too wide.** Even where it works, the content is still 150px wide, still dragging focus rings and screen-reader reading order off into hidden space.

The real fix removes the cause:

```css
/* min-width:0 on both, or the select's intrinsic width — the widest company or
   city name in the option list — becomes an unshrinkable floor and pushes the
   rail ~150px past the viewport. That is what made the whole page scroll
   sideways on a phone. The ellipsis keeps a long name from looking clipped. */
.picks label { flex: 1 1 calc(50% - 4px); min-width: 0; }
.picks select {
  max-width: none; flex: 1; min-width: 0; width: 100%;
  text-overflow: ellipsis; white-space: nowrap; overflow: hidden;
}
```

`web/public/styles.css:515-523`, inside `@media (max-width: 680px)`.

`flex: 1 1 calc(50% - 4px)` on the label asks for half the row minus half the 8px gap, so the four filters form a 2×2 block. `min-width: 0` on *both* label and select overrides the `auto` default and lets them shrink. `max-width: none` releases the 140px desktop cap. `text-overflow: ellipsis` plus `white-space: nowrap` plus `overflow: hidden` — all three needed together — truncate a long name with "…".

The trade-off: a long company name is now unreadable until you open the dropdown. That is the right thing to give up. A name you can read by tapping beats a page that shakes sideways on every scroll.

---

## 3.9 Bug two: 353 frozen pixels

The second bug looked fine on a laptop. The header is 62px, and on a wide screen the rail is one line, so the pinned stack costs about 110px. On a phone the rail wraps: tabs, then search, then four dropdowns, then toggle chips. Both were sticky. Together they pinned **353 pixels** — roughly half a phone display — permanently. The listings scrolled through a letterbox slot.

```css
/* Only the 62px bar stays pinned. The rail wraps to three rows here, and
   sticking it too froze ~350px — nearly half a phone screen — above every
   scroll. It scrolls away now; the bar is what you need while scrolling. */
.rail { position: static; backdrop-filter: none; -webkit-backdrop-filter: none; }
```

`web/public/styles.css:525-528`. `position: static` returns the rail to normal flow, so it scrolls away like any other content. `backdrop-filter: blur(14px)` — which blurs whatever is behind an element — is switched off with it, because a blur only means anything when something scrolls underneath, and it costs phone GPU time for nothing.

The judgment: on a phone you *set* filters once and then *scroll* for a long time. Pinning the thing you set once cost the thing you do constantly. The header stays because it is small and holds the theme toggle and the link home.

This fix then broke something else, which is where the next sections lead.

---

## 3.10 The DOM is not the HTML file

When the browser downloads `index.html` it parses that text once and builds a tree of objects in memory. That tree is the **DOM**. From then on the file is history: the DOM is what is on screen, and JavaScript changes the DOM, not the file.

Open the site, use the filters, then View Source: you still see `<ol class="feed" id="joblist"></ol>`, empty, exactly as on disk. Open DevTools' Elements panel and you see forty `<li>` elements. Both are true. **View Source shows the delivery; Elements shows the DOM.**

```js
document.getElementById('joblist')   // one element by id
document.querySelector('.bar')       // first match for a CSS selector
document.querySelectorAll('.row')    // every match
document.createElement('li')         // a new element, not yet in the page
parent.append(child)                 // put it in
list.replaceChildren()               // empty it
```

`querySelector` takes any CSS selector, which is why learning selectors pays twice.

This project builds every element by hand, through a five-line helper:

```js
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
```

`web/public/app.js:10-15`. `text != null` rather than `if (text)` is deliberate: it lets the number `0` and the empty string through, where a truthiness check would silently drop them. With it, building a card reads almost like the markup it produces:

```js
mid.append(el('h3', 'co', job.company));
mid.append(el('p', 'role', job.title));
```

`web/public/app.js:243-244`.

---

## 3.11 `textContent`, `innerHTML`, and a real security decision

**`node.textContent = "…"`** sets characters. `<b>hi</b>` appears on screen as those literal characters. **`node.innerHTML = "…"`** parses the string as HTML and builds elements from it, so `<b>hi</b>` becomes bold text.

`innerHTML` is convenient, and it is how sites get hacked. The attack is **XSS** (cross-site scripting): an attacker gets text they control into a page, that text is parsed as HTML, and the script inside runs with your site's full privileges — reading cookies, calling your API as the logged-in user, rewriting the page.

Now look at what this site displays: company names, job titles, skill lists and summary bullets **scraped from LinkedIn postings written by strangers**. The site controls none of it. A job title containing an image tag with a broken `src` and an `onerror` handler would, through `innerHTML`, run that handler in every visitor's browser.

The mitigation is one line in `el()`: `n.textContent = text`. Every scraped string — `job.company`, `job.title`, each `job.bullets` entry, each `job.keySkills` entry — reaches the DOM through it (`web/public/app.js:243-244, 269, 276, 280`). A `<script>` tag in a job title renders as the characters of a script tag. No sanitiser library, no escaping function, no npm dependency: a choice of API, applied without exception. **The safe default is free; the unsafe one is what costs you.**

There is exactly one `innerHTML` in 825 lines, at `web/public/app.js:395` — a hardcoded SVG icon with no external data in it. That is the honest distinction: `innerHTML` is dangerous with *untrusted* input, not in itself. One exception with a clear reason is fine. Not knowing which of your strings are trusted is not.

---

## 3.12 Events, delegation, and how the browser paints

An **event** is something that happens — a click, a keypress, a resize. You react with `addEventListener(type, handler)`.

```js
row.addEventListener('click', () => selectJob(job.id));
row.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectJob(job.id); }
});
```

`web/public/app.js:297-300`. The `keydown` handler exists because the row is an `<article>` given `role="button"` and `tabIndex = 0` (lines 226-228), and a fake button gets no keyboard behaviour for free. `e.preventDefault()` stops Space from scrolling. This is the cost of ARIA over a real element: forget the handler and you lock out every keyboard user.

**Bubbling** is what happens next: the event runs on the target, then its parent, then that parent's parent, up to `document`. **Delegation** uses that on purpose — one listener on `#joblist`, with `event.target.closest('.row')` identifying which row was hit, instead of forty listeners.

**This project does not use delegation.** It attaches two listeners per row, and `renderList()` rebuilds every row on every keystroke. Defensible: `list.replaceChildren()` (`web/public/app.js:308`) discards the old nodes and their listeners together, so nothing leaks, and the list is tens of rows. But delegation would be less code and would scale, and it is the first thing to change if the board ever showed thousands of rows.

### Layout, reflow, paint

The browser turns the DOM into pixels in stages: **style** (resolve every property), **layout** (also called **reflow** — compute every box's exact position and size, the expensive stage because boxes depend on each other), **paint** (fill in pixels), **composite** (stack the layers). Changing geometry forces layout; changing colour forces paint only; changing `transform` or `opacity` can often be done by the compositor alone — which is why `.row:hover { transform: translateY(-2px) }` (line 254) is cheap and animating `top` would not be.

`renderList()` respects this:

```js
const frag = document.createDocumentFragment();
state.filtered.forEach((job, i) => frag.append(jobCard(job, i)));
list.append(frag);
```

`web/public/app.js:335-337`. A `DocumentFragment` is a container that is not in the page. Forty rows are built inside it, off-screen, costing nothing, then inserted in **one** append — one layout pass instead of up to forty.

### Measuring instead of guessing

Both layout bugs changed the pinned stack's height: shrinking the header changed it, making the rail static changed it to zero. Every hardcoded offset was now wrong, and the detail pane's heading slid under the rail. So stop guessing:

```js
function syncStickyOffset() {
  const bar = document.querySelector('.bar');
  const rail = document.querySelector('.rail');
  if (!bar || !rail) return;
  // Count only what is actually pinned. Below 680px the rail goes position:static
  // and scrolls away, so summing it there would reserve ~290px of offset that
  // nothing occupies and push the listings down behind a gap.
  const h = [bar, rail]
    .filter((el) => getComputedStyle(el).position === 'sticky')
    .reduce((sum, el) => sum + el.getBoundingClientRect().height, 0);
  document.documentElement.style.setProperty('--stack-h', `${Math.round(h)}px`);
}
```

`web/public/app.js:777-788`.

- `getComputedStyle(el)` returns what the browser actually resolved after every rule and media query, so `.position === 'sticky'` answers "is this pinned *right now, at this width*". The media query at line 528 is already accounted for; nothing in JavaScript duplicates the number 680.
- `getBoundingClientRect().height` is the real rendered height, including however many lines the rail wrapped to.
- `setProperty('--stack-h', …)` writes the answer onto `<html>` as an inline style, beating the stylesheet default, and every `calc(var(--stack-h) + 16px)` updates at once.

The variable flows **CSS → JavaScript → CSS**. CSS decides what is sticky, JavaScript measures the result, CSS consumes the measurement. Neither side hardcodes the other's numbers.

```js
syncStickyOffset();
addEventListener('resize', syncStickyOffset, { passive: true });
document.fonts?.ready.then(syncStickyOffset);
```

`web/public/app.js:797-801`, plus once more at the end of `applyFilters()` (line 183). Each call is a bug that happened: once on boot; again on resize, because rotating a phone rewraps the rail; again when web fonts land, because until then a fallback font with different metrics may wrap the rail differently; again after filtering, because the rail's contents change. `{ passive: true }` promises the handler will not call `preventDefault()`, so the browser need not wait for it. `document.fonts?.ready` uses optional chaining so an old browser without the Font Loading API does not throw.

---

## Chapter summary

- HTML marks content into a strict tree with a `<head>` of information about the page and a `<body>` of what you see; here `id` is the JavaScript handle and `class` the CSS handle, kept as separate namespaces.
- Semantic elements and a real `<button>` give keyboard and screen-reader behaviour free; `role="button"` on a `<div>` means you owe the keyboard handler yourself, which `jobCard` pays at `web/public/app.js:298`.
- `index.html` ships an empty `<ol id="joblist"></ol>`, so crawlers and no-JavaScript users see no listings — the accepted price of having no server and no build step.
- The favicon is an inline SVG data URI with `#` escaped as `%23`, so there is no icon file and no extra request.
- Accessibility attributes double as styling state — `aria-selected`, `aria-pressed`, `aria-current` are the CSS selectors — so state and appearance cannot drift apart.
- Custom properties on `:root`, redefined under `:root[data-theme="light"]`, are the entire theming system; JavaScript switches themes by setting one attribute.
- A flex or grid item's default `min-width: auto` floors it at its widest content, which pushed the filter rail 150px past a phone viewport; `min-width: 0` fixed it and `overflow-x: hidden` on `body` did not.
- Two sticky elements froze 353px of a phone screen, so the rail becomes `position: static` under 680px — the header is what you need while scrolling, the filters are not.
- The DOM is the browser's live tree, not the HTML file, and `el()` sets every string with `textContent`, which is why scraped LinkedIn text cannot execute as script.
- `syncStickyOffset()` measures the pinned stack with `getComputedStyle` and `getBoundingClientRect` and publishes it as `--stack-h`, so no number is duplicated between stylesheet and script.

## Key takeaways

A page is a tree, a set of rules decorating the tree, and a live in-memory copy that JavaScript edits. Learn selectors once and you have learned them for CSS and for `querySelector` together. Both layout bugs here share one shape: a value assumed rather than measured — an intrinsic minimum nobody knew about, a stack height nobody rechecked — so when the assumption changed, the layout broke silently on the one device that was never tested. And `textContent` versus `innerHTML` is the cheapest security decision in web development: the safe option is also the shorter one.

## Interview questions

**1. What is the DOM, and how is it different from the HTML file?**
The HTML file is text sent over the network. The browser parses it once and builds the DOM — a tree of objects representing every element, with parents, children and properties. After that the file is irrelevant; the DOM is what is rendered, and JavaScript edits the DOM. You can see the gap on this site: View Source shows `<ol id="joblist">` empty, because that is the delivered file, while DevTools' Elements panel shows forty `<li>` elements, because that is the current DOM. The DOM can also be built from sources the file never mentioned, which is exactly what happens here — the rows come from a JSON file fetched after load.

**2. Why no framework — why not React?**
The page is one screen with one list, and the whole browser-side app is 825 lines. React's value is coordinating state across many components; here the state is one object with seven fields at `web/public/app.js:17-27`, and rendering is one function rebuilding one list. Adopting React would add a build step and node_modules to a project whose defining property is that the file you edit is the file that ships. The cost is that all DOM work is manual — `jobCard` builds twenty-odd elements by hand where JSX would be shorter to read — and there is no component reuse. At a hundred components that trade flips.

**3. What is specificity, and where does it matter in this codebase?**
When two rules set the same property on one element, specificity decides: count ids, then classes/attributes/pseudo-classes, then element names, compared left to right; ties break on source order, later wins. It matters at `web/public/styles.css:528`, where `.rail { position: static }` inside a media query beats `.rail { position: sticky }` at line 161 purely by coming later. It is also why the one `!important` in the file exists: `[hidden] { display: none !important }` at line 53, because the browser's default for the `hidden` attribute is too weak to beat a class setting `display: flex`, and that line is what makes `element.hidden = true` reliable everywhere.

**4. Walk me through the mobile horizontal-scroll bug.**
The filter dropdowns are flex items, and a flex item's default `min-width` is `auto`, not zero — it will not shrink below its intrinsic content width. For a `<select>` that is the width of its widest `<option>`, and the company list is filled at runtime from real company names. Four of those made the rail roughly 150px wider than a phone viewport, and the page grew to contain it, so everything scrolled sideways. The fix at `web/public/styles.css:519-523` is `min-width: 0` on both the `<label>` and the `<select>`, plus `flex: 1 1 calc(50% - 4px)` to lay them out two-by-two and `text-overflow: ellipsis` to truncate. The trade-off is that a long company name is now clipped when the dropdown is closed.

**5. You had `body { overflow-x: hidden }`. Why didn't that fix it — and why is it still in the file?**
It did not fix it because overflow set on `body` only clips when the browser treats `body` as the scrolling box, and `html` was still `overflow-x: visible`, so the page kept its own horizontal scroll and the rule was a no-op. And yes, it is still there at `web/public/styles.css:66`, which is fair to criticise — it is a leftover, kept as a cheap guard, but it is dead weight and a reader could reasonably assume it is what fixed the bug. The deeper point stands either way: `overflow: hidden` hides a symptom. The box is still too wide, focus rings and screen-reader reading order still run into the hidden region, and the defect is untouched.

**6. Why is the job list empty in the HTML, and what does that cost?**
There is no server rendering the page and no build step generating it — static files on Vercel, fed by a JSON file the watcher commits to git — so `app.js` fetches the JSON and builds every row at runtime. The cost is real: crawlers that do not run JavaScript see zero jobs, individual postings are not indexable, and a user whose script blocker eats `app.js` sees "loading" forever, with no `<noscript>` fallback. The one mitigation is that the Open Graph tags are static, so share cards are correct even when the listings are not visible to the bot. If search traffic mattered here, this is the first thing I would change — probably by generating the HTML at publish time in `src/publish.js`, since the data changes only twice a day.

**7. `textContent` versus `innerHTML` — which does this use, and why does it matter specifically here?**
`textContent` sets characters; `innerHTML` parses the string as HTML and builds elements. This site renders company names, job titles, skills and bullets scraped from LinkedIn postings written by strangers, so every one of those strings is attacker-influenced input. Through `innerHTML`, markup in a job title would become live elements and an `onerror` handler would run with the site's full privileges in every visitor's browser — cross-site scripting. The `el()` helper at `web/public/app.js:10-15` assigns `textContent` unconditionally, so a `<script>` tag in a title renders as visible characters. There is one `innerHTML` in the file, at line 395, and it is a hardcoded SVG icon with no external data — which is the real rule: `innerHTML` is dangerous with untrusted input, not in itself.

**8. What is event delegation, and why isn't it used here?**
Events bubble from the target up through every ancestor, so instead of a listener per row you can put one on the container and use `event.target.closest('.row')` to find what was clicked — one listener instead of forty, and it keeps working for rows added later. This project attaches click and keydown listeners to every row in `jobCard` (`web/public/app.js:297-300`), and `renderList()` rebuilds all rows on every keystroke. It is defensible because `replaceChildren()` discards nodes and their listeners together, so nothing leaks, and the list is tens of rows. But delegation would genuinely be less code and would scale, and I would switch if the board ever showed thousands of rows.

**9. Explain `syncStickyOffset()`. Why not hardcode the offset?**
It measures the height of whatever is currently pinned and publishes it as `--stack-h`, which `.row`, `.pane-col` and `.pane` consume through `calc()`. It cannot be hardcoded for three reasons: the header height changed during a redesign, the rail wraps to a different number of lines depending on viewport width, and below 680px the rail is `position: static` and contributes nothing. So it filters on `getComputedStyle(el).position === 'sticky'`, which keeps the CSS media query as the single source of truth for the breakpoint, then sums `getBoundingClientRect().height`. It re-runs on resize, after `document.fonts.ready` because web fonts change text metrics and can rewrap the rail, and after filtering.

**10. That resize handler is unthrottled. Isn't that a performance problem?**
Potentially, and it is a fair hit. `resize` fires continuously while a desktop window is dragged, and each call does two `getComputedStyle` reads and two `getBoundingClientRect` calls, which force the browser to flush pending layout. In practice it is two elements with no writes inside a loop, so it has never been measurable, and phones mostly fire resize on rotation. But "never measurable" means I have not profiled it, which is the honest answer. The fix is one line — schedule the work inside `requestAnimationFrame` so multiple events coalesce into one measurement per frame — and I would take it if the page grew.

**11. You made the filter rail scroll away on phones. Doesn't that make filtering harder?**
Yes, slightly: you now scroll back to the top to change a filter. That was the deliberate trade. Pinning both the header and the rail froze 353 pixels, about half a phone screen, so the listings scrolled through a letterbox slot. The usage pattern is that you set filters once and then scroll for a long time, so pinning what you set once cost what you do constantly. The header stays sticky because it is only 62px and carries the theme toggle and the link home. A collapsed single-line rail that expands on tap would get both, but that is more code and more state to get wrong.

**12. There are no automated tests for any of this. How do you know it works?**
I do not, with certainty — that is the biggest honest weakness in the browser-side code. The watcher has tests using Node's built-in `assert`, but `app.js`, the HTML and the CSS are verified by opening the page and looking, which is exactly how both layout bugs shipped: they were invisible on the laptop they were written on. Layout is genuinely hard to unit-test; catching those two would have needed a headless browser at a phone viewport asserting that `document.documentElement.scrollWidth` never exceeds `clientWidth`. That check is a handful of lines with Playwright, which is already a dependency for the scraper, and it is the highest-value test this project does not have.

## Common beginner mistakes

**Styling a `<div>` to look like a button.** It looks identical, so it seems fine. It is invisible to Tab, does nothing on Enter or Space, and announces as nothing to a screen reader. Use `<button type="button">`; if you truly cannot, you owe `tabindex="0"`, `role="button"` and a keydown handler — exactly what `jobCard` pays at `web/public/app.js:226-228` and `298-300`.

**Reaching for `overflow-x: hidden` when the page scrolls sideways.** It feels like the fix because sometimes the scrollbar vanishes. The over-wide box is still there, still dragging focus and reading order into hidden space — and here the rule did not even do that much, because `html` was still `overflow-x: visible`. Find the culprit in DevTools and fix its width, usually with `min-width: 0`.

**Assuming `flex: 1` means "shrink to fit".** It reads that way and behaves that way on short content. But the default `min-width: auto` floors the item at its intrinsic width, so one long `<option>` or one unbreakable word sets a width nothing can undo. Add `min-width: 0` to any flex item that must shrink, and use `minmax(0,1fr)` rather than `1fr` for grid columns.

**Using `innerHTML` because it is fewer lines.** For markup you wrote yourself it is harmless. For any string from a user, an API, or a scraped page it is a cross-site scripting hole, because the string is parsed as markup and any script in it runs as your site. Default to `textContent` and treat `innerHTML` as something you justify in a comment.

**Hardcoding a sticky header's height somewhere else.** `top: 152px` works the day you write it. Then you shrink the header, or the phone rotates, or a web font loads and the bar rewraps, and the number is quietly wrong with nothing to warn you. Measure it and publish it as a custom property, as `syncStickyOffset()` does.

**Fixing the desktop layout and shipping.** The laptop is where the code is written, so it is where the code is checked. Both real bugs here were invisible at 1440px and severe at 390px. Open DevTools' device toolbar and check at 375px before every push.

## Exercises

1. Open `web/public/index.html` and list every element carrying an ARIA attribute. For each, write one sentence on what a screen reader user gains, and say whether a plain HTML element could have done the job without ARIA.

2. In DevTools, edit the Engineering tab's `aria-selected` from `true` to `false` in the Elements panel and watch the appearance change with no JavaScript running. Explain in two sentences why the rule at `web/public/styles.css:182` makes that possible, and what class of bug the pattern prevents.

3. Reproduce bug one. Comment out `min-width: 0` on `.picks select` at `web/public/styles.css:521`, load the site at a 375px viewport, and confirm the sideways scroll. Then measure it in the console by comparing `document.documentElement.scrollWidth` with `clientWidth`. Restore the line.

4. 🔴 Convert the job list to event delegation. Remove the two `addEventListener` calls in `jobCard` (`web/public/app.js:297-300`) and attach one click and one keydown listener to `#joblist` instead, using `event.target.closest('.row')` and its `dataset.id`. Verify that Enter and Space still select, that Space does not scroll the page, and that `aria-current` still moves correctly. Then state what you gained and what you lost.

## Quiz

1. What is the difference between an `id` and a `class`, and which does this project use as its JavaScript handle?
2. Why must `<meta charset="utf-8">` appear near the very top of the `<head>`?
3. What does `box-sizing: border-box` change about how `width` is interpreted?
4. Two rules have identical specificity and both apply. Which wins?
5. What is a flex item's default `min-width`, and why did that cause a 150px horizontal overflow here?
6. Why does `el()` use `textContent` rather than `innerHTML`, given what this site displays?

---

### Quiz answers

1. An `id` must be unique in the document; a `class` may be reused on any number of elements, and one element may carry several. This project uses `id` as the JavaScript handle — every `$('…')` call at `web/public/app.js:9` is a `getElementById` — and `class` as the CSS handle, so either can change without breaking the other.

2. The browser must know the encoding before it can turn the remaining bytes into characters, and it only scans the first 1024 bytes for the declaration. Missing or too late, it guesses, and non-ASCII characters like the em-dash in the title render as garbage.

3. By default `width` sizes the content box only, so padding and border are added on top and the visible box is wider than the number you wrote. `border-box` makes `width` include padding and border, so `width: 200px` occupies exactly 200px. It is set on everything at `web/public/styles.css:52`.

4. The one appearing later in the source. That is why the responsive `@media` blocks sit at the bottom of `styles.css`: `.rail { position: static }` at line 528 beats `.rail { position: sticky }` at line 161 for exactly this reason.

5. `auto`, not `0` — the item refuses to shrink below its intrinsic content width. For `.picks select` that was the widest `<option>`, a real company name, so four dropdowns forced the rail about 150px past a phone viewport and the whole page scrolled sideways. The fix is `min-width: 0` at `web/public/styles.css:519-521`.

6. `innerHTML` parses its string as HTML, so any markup becomes live elements and any script in it runs with the site's privileges. This site renders company names, job titles, skills and bullets scraped from LinkedIn postings it does not control, so that would be a cross-site scripting hole. `textContent` renders the string as characters, making malicious markup harmless by construction.
