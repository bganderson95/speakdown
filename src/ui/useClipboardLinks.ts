/**
 * useClipboardLinks.ts — resolving "link the docs to clipboard".
 *
 * The parser cannot read the clipboard: it is pure, and the browser only allows
 * the read from a secure context. So the parser emits a sentinel href and this
 * hook swaps in the real URL.
 *
 * The read is attempted once per session rather than on every keystroke, and a
 * refusal is recoverable: the caller gets a `retry` it can put behind a click,
 * which is the user gesture browsers want.
 */

import { useEffect, useState } from "react";
import type { DocumentModel } from "../model/documentModel.js";
import {
  hasClipboardLinks,
  readClipboardText,
  resolveClipboardLinks,
} from "../input/resolveClipboardLinks.js";

export interface ClipboardLinks {
  /** The document with clipboard sentinels resolved, or the original. */
  document: DocumentModel;
  /** What happened, in words worth showing. */
  notices: string[];
  /** True while a clipboard link is still waiting for a URL. */
  awaitingClipboard: boolean;
  retry: () => Promise<void>;
}

export function useClipboardLinks(document: DocumentModel): ClipboardLinks {
  const [clipboardUrl, setClipboardUrl] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  const wanted = hasClipboardLinks(document);

  useEffect(() => {
    if (!wanted || tried) {
      return;
    }
    let cancelled = false;
    void readClipboardText().then((text) => {
      if (!cancelled) {
        setClipboardUrl(text);
        setTried(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [wanted, tried]);

  const resolution = resolveClipboardLinks(document, clipboardUrl);

  return {
    document: resolution.document,
    notices: resolution.notices.map((notice) => notice.message),
    awaitingClipboard: wanted && clipboardUrl === null,
    /** Retrying inside a click gives the browser the user gesture it wants. */
    async retry() {
      setClipboardUrl(await readClipboardText());
      setTried(true);
    },
  };
}
