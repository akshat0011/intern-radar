/**
 * Human-ish pacing and interaction.
 *
 * The point of this module is not to be undetectable — it is to keep the tool's
 * footprint far below anything LinkedIn would consider abusive, and to make the
 * interaction pattern look like a person reading job posts rather than a script
 * hammering a list.
 */

/** Random integer in [min, max]. */
export function rand(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

/** Random value from a `[min, max]` config pair. */
export function randFrom(pair) {
  const [min, max] = pair;
  return rand(min, max);
}

/**
 * Gaussian-ish delay, biased toward the middle of the range.
 * Uniform delays are themselves a detectable signature; summing two uniforms
 * gives a cheap triangular distribution that clusters mid-range like real
 * reading time does.
 */
export function humanDelay(pair) {
  const [min, max] = pair;
  const mid = (max - min) / 2;
  return Math.floor(min + (Math.random() * mid + Math.random() * mid));
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Sleep for a human-ish duration drawn from a config `[min, max]` pair. */
export function pause(pair) {
  return sleep(humanDelay(pair));
}

/**
 * Move the mouse toward a target in a few stepped hops rather than teleporting.
 * Playwright's default click jumps the pointer instantly with no intermediate
 * mousemove events; a few steps produces a more ordinary event stream.
 */
export async function humanMouseTo(page, x, y, steps = rand(6, 14)) {
  await page.mouse.move(x, y, { steps });
}

/**
 * Hover an element, wait a beat, then click it — the ordinary human sequence.
 * Returns false if the element vanished (LinkedIn re-renders its list often).
 */
export async function humanClick(page, locator, { timeout = 10_000 } = {}) {
  try {
    await locator.scrollIntoViewIfNeeded({ timeout });
    const box = await locator.boundingBox({ timeout });
    if (!box) return false;

    // Aim at a random point inside the element, not dead centre.
    const x = box.x + box.width * (0.3 + Math.random() * 0.4);
    const y = box.y + box.height * (0.3 + Math.random() * 0.4);

    await humanMouseTo(page, x, y);
    await sleep(rand(120, 480));
    await page.mouse.down();
    await sleep(rand(40, 130));
    await page.mouse.up();
    return true;
  } catch {
    return false;
  }
}

/**
 * Scroll a scrollable container in small steps, as a person flicking a
 * trackpad would. LinkedIn's job list virtualises its rows, so the list only
 * materialises cards that have been scrolled near — this is how we force all
 * of them to render.
 */
export async function humanScrollContainer(page, selector, { steps = 10, stepPause = [400, 900] } = {}) {
  for (let i = 0; i < steps; i++) {
    const atBottom = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return true;
      const before = el.scrollTop;
      el.scrollBy(0, 220 + Math.random() * 260);
      // If scrollTop did not move, we have hit the end of the container.
      return el.scrollTop === before;
    }, selector);

    await pause(stepPause);
    if (atBottom) return true;
  }
  return false;
}

/** Scroll the window itself in human-sized increments. */
export async function humanScrollPage(page, { steps = 6, stepPause = [400, 900] } = {}) {
  for (let i = 0; i < steps; i++) {
    try {
      await page.mouse.wheel(0, rand(200, 500));
    } catch {
      return; // page gone; the caller's next real action will report it
    }
    await pause(stepPause);
  }
}

/**
 * Occasionally do something pointless — a small scroll back up, a stray mouse
 * drift. Real sessions are noisy; perfectly purposeful ones are not.
 *
 * This is decoration, so it must never be able to fail a run. It once did: a
 * mouse.wheel on a browser that had just crashed threw, and aborted a run that
 * had already collected 51 jobs. Anything purely cosmetic swallows its errors.
 */
export async function idleFidget(page) {
  try {
    if (Math.random() < 0.35) {
      await page.mouse.wheel(0, -rand(80, 260));
      await sleep(rand(300, 1200));
    }
    if (Math.random() < 0.3) {
      const w = page.viewportSize()?.width ?? 1200;
      const h = page.viewportSize()?.height ?? 800;
      await humanMouseTo(page, rand(100, w - 100), rand(100, h - 100));
      await sleep(rand(200, 700));
    }
  } catch {
    // Page or browser gone. The next real interaction will surface that
    // properly; a failed flourish is not itself news.
  }
}

/**
 * Is the browser still there?
 *
 * Used to turn "mouse.wheel: Target page, context or browser has been closed"
 * into a statement of what actually happened.
 */
export async function pageAlive(page) {
  try {
    if (page.isClosed?.()) return false;
    await page.evaluate(() => 1);
    return true;
  } catch {
    return false;
  }
}
