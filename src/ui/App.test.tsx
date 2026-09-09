/**
 * A smoke test: the UI composes and renders the sample transcript without
 * throwing, and both views come out of the same document.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";

describe("App", () => {
  const markup = renderToStaticMarkup(<App />);

  /**
   * Just the document panel. Slicing only from its start would run on into the
   * vocabulary below, whose examples mention the same words the document does —
   * which makes any "should not contain" assertion meaningless.
   */
  const rendered = (() => {
    const start = markup.indexOf('class="page-body page-rendered"');
    return markup.slice(start, markup.indexOf("</section>", start));
  })();

  it("renders the masthead", () => {
    expect(markup).toContain("Speak");
    expect(markup).toContain("down");
    expect(markup).toContain("speech to rich text");
  });

  it("renders the sample transcript through the rendered view", () => {
    expect(rendered).toContain("<strong>short</strong>");
    expect(rendered).toContain("<code>parser</code>");
    expect(rendered).toContain("<blockquote>");
    expect(rendered).toContain("🚀");
  });

  it("exercises every block kind in the sample", () => {
    expect(rendered).toContain("<h1>Speakdown</h1>");
    expect(rendered).toContain("<h2>This week</h2>");
    expect(rendered).toContain("<ol>");
    expect(rendered).toContain('<ul class="task-list">');
    expect(rendered).toContain('<input type="checkbox" disabled checked />');
    expect(rendered).toContain("<hr />");
    expect(rendered).toContain("<del>behind</del>");
    expect(rendered).toContain('<pre><code class="language-python">');
    expect(rendered).toContain("URGENT");
  });

  it("renders computed transform results, not the spoken words", () => {
    // The transcript textarea still holds what was said; the document holds
    // what it resolved to.
    expect(rendered).toContain("48 points");
    expect(rendered).not.toContain("12 times 4");
    expect(rendered).toMatch(/ship on \d{4}-\d{2}-\d{2}/);
    expect(rendered).toContain("maps/search/?api=1");
  });

  it("renders the vocabulary from the command definitions", () => {
    expect(markup).toContain("bullet list");
    expect(markup).toContain("scratch that");
    expect(markup).toContain("end bold / unbold");
    expect(markup).toContain("numbered list / ordered list");
    expect(markup).toContain("heading &lt;1-6&gt;");
  });

  it("lists the transformations", () => {
    expect(markup).toContain("end math");
    expect(markup).toContain("Transformations");
  });

  it("mentions no trigger word anywhere", () => {
    expect(markup).not.toContain("Trigger word");
    expect(markup).not.toContain("format bold");
  });

  it("shows the voice line at rest, which is the recording indicator", () => {
    expect(markup).toContain("voice-line");
    expect(markup).toContain("voice-line-rest");
    // Not listening, so no live class and no separate blinking lamp.
    expect(markup).not.toContain("voice-line-live");
  });

  it("offers the speak control and says it is not recording", () => {
    expect(markup).toContain("speak-button");
    expect(markup).toContain("not recording");
  });

  it("puts the rendered/raw switch on the document, not in the chrome", () => {
    const workspace = markup.indexOf('class="workspace');
    const toggle = markup.indexOf('aria-label="Output view"');

    expect(toggle).toBeGreaterThan(workspace);
    expect(markup).toContain('aria-pressed="true"');
  });

  it("hides the transcript by default", () => {
    expect(markup).toContain("workspace-solo");
    expect(markup).not.toContain('id="transcript-input"');
  });

  it("puts the transcript control above the panels, never below what it hides", () => {
    const controls = markup.indexOf('class="chrome-row"');
    const workspace = markup.indexOf('class="workspace');

    expect(controls).toBeGreaterThan(-1);
    expect(controls).toBeLessThan(workspace);
    expect(markup).toContain("show transcript");
  });

  it("keeps the meter with the button rather than spanning the page", () => {
    const transport = markup.indexOf('class="transport"');
    const button = markup.indexOf("speak-button");
    const meter = markup.indexOf("voice-well");

    expect(transport).toBeLessThan(button);
    expect(button).toBeLessThan(meter);
  });

  it("shows no typing indicator when nothing is being said", () => {
    // It reports live speech, not merely that the app is running.
    expect(markup).not.toContain("typing-dot");
  });

  it("reports what formatting is still open", () => {
    // The sample closes everything it opens.
    expect(markup).toContain("nothing open");
  });
});
