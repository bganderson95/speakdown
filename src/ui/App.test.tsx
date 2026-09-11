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
    // The S is the logo rather than a glyph, so the name lives in the label.
    expect(markup).toContain('aria-label="Speakdown"');
    expect(markup).toContain("wordmark-mark");
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

  it("offers Record, and the status agrees with it", () => {
    expect(markup).toContain("record-button");
    expect(markup).toContain(">Record<");
    expect(markup).toContain("Not recording");
  });

  it("puts recording in one row before the workspace, and nothing else", () => {
    // Record, then the meter and status — one sweep, then the page itself.
    const bar = markup.indexOf('class="action-bar"');
    const record = markup.indexOf("record-button");
    const meter = markup.indexOf("voice-well");
    const workspace = markup.indexOf('class="workspace');

    expect(bar).toBeGreaterThan(-1);
    expect(bar).toBeLessThan(record);
    expect(record).toBeLessThan(meter);
    expect(meter).toBeLessThan(workspace);
  });

  it("puts the controls that act on the document onto the document header", () => {
    // Show transcript, the view switch and Clear all change what the panel
    // below them shows, so they sit on it rather than up in the action row.
    const actions = markup.indexOf('class="document-actions"');
    const page = markup.indexOf('class="page"');

    expect(markup.indexOf('class="action-bar"')).toBeLessThan(actions);
    expect(actions).toBeLessThan(page);
    for (const control of ["quiet-toggle", "switch-option", ">Clear<"]) {
      const at = markup.indexOf(control);
      expect(at).toBeGreaterThan(actions);
      expect(at).toBeLessThan(page);
    }
  });

  it("sets the escape word in the vocabulary, with no settings menu at all", () => {
    // One setting did not earn a menu. It sits with the commands it governs,
    // and Editing leads the groups so it is the first thing under the intro.
    const editing = markup.indexOf(">Editing<");
    const field = markup.indexOf('id="escape-word-input"');

    expect(markup).not.toContain("settings-trigger");
    expect(markup).toContain("Escape word");
    expect(editing).toBeGreaterThan(-1);
    expect(field).toBeGreaterThan(editing);
    expect(editing).toBeLessThan(markup.indexOf(">Inline marks<"));
  });

  it("asks for a key in the masthead, because nothing records without one", () => {
    // Required steps do not go behind a disclosure. The field itself is in the
    // chrome, beside Settings rather than inside it.
    const aside = markup.indexOf('class="masthead-aside"');
    const keybar = markup.indexOf('class="keybar"');

    expect(aside).toBeGreaterThan(-1);
    expect(keybar).toBeGreaterThan(aside);
    expect(keybar).toBeLessThan(markup.indexOf('class="action-bar"'));
    expect(markup).toContain("AssemblyAI key needed to record");
    expect(markup).toContain("Get a free key");
  });

  it("does not say a key is saved when none is", () => {
    expect(markup).not.toContain("key-chip");
  });

  it("says nothing about open formatting when none is open", () => {
    // The sample closes everything it opens, so the row is absent entirely
    // rather than carrying a permanent "nothing open" label.
    expect(markup).not.toContain('aria-label="Still open"');
  });
});
