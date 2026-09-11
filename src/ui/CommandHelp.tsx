/**
 * CommandHelp.tsx — the command vocabulary, rendered as the user would say it.
 *
 * Generated from describeCommands() and the live config, so the help updates
 * with the escape word and can never describe a command the parser does not
 * accept.
 *
 * The escape word is set here rather than in a settings menu: it is the one
 * configurable part of the vocabulary, and this is the vocabulary. Editing
 * leads the groups so the field is the first thing under the intro that
 * mentions it.
 */

import type { CommandDoc, ParserConfig } from "../parser/commands.js";
import { describeCommands } from "../parser/commands.js";

interface CommandHelpProps {
  config: ParserConfig;
  escapeInput: string;
  escapeError: string | null;
  onEscapeInputChange: (value: string) => void;
}

/** The vocabulary split into its display groups, in first-seen order. */
function groupCommands(docs: readonly CommandDoc[]): Array<[group: string, docs: CommandDoc[]]> {
  const groups: Array<[string, CommandDoc[]]> = [];

  for (const doc of docs) {
    const existing = groups.find(([group]) => group === doc.group);
    if (existing === undefined) {
      groups.push([doc.group, [doc]]);
    } else {
      existing[1].push(doc);
    }
  }

  // Editing carries the escape word, so it reads first. The rest keep the order
  // the command table declares them in.
  return groups.sort(([a], [b]) => Number(b === "Editing") - Number(a === "Editing"));
}

/** The one setting, sitting with the commands it governs. */
function EscapeWordField({
  escapeInput,
  escapeError,
  onEscapeInputChange,
}: {
  escapeInput: string;
  escapeError: string | null;
  onEscapeInputChange: (value: string) => void;
}) {
  return (
    <div className="help-setting">
      <label className="help-setting-label" htmlFor="escape-word-input">
        Escape word
      </label>
      <input
        id="escape-word-input"
        className={escapeError === null ? "help-setting-input" : "help-setting-input help-setting-input-bad"}
        value={escapeInput}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={escapeError !== null}
        aria-describedby={escapeError === null ? undefined : "escape-word-error"}
        onChange={(event) => onEscapeInputChange(event.target.value)}
      />
      {escapeError === null ? (
        <p className="help-setting-note">Choose the word you would rather say.</p>
      ) : (
        <p className="help-setting-note help-setting-note-bad" id="escape-word-error" role="alert">
          {escapeError}
        </p>
      )}
    </div>
  );
}

export function CommandHelp({
  config,
  escapeInput,
  escapeError,
  onEscapeInputChange,
}: CommandHelpProps) {
  const docs = describeCommands(config);

  return (
    <section className="help">
      <h2 className="help-title">Vocabulary</h2>
      <p className="help-intro">
        Commands are spoken plainly, with no prefix word. Marks and blocks open with one phrase and
        close with another. To write a command word as ordinary text, put{" "}
        <code>{config.escapeWord}</code> in front of it.
      </p>

      {groupCommands(docs).map(([group, groupDocs]) => (
        <div key={group} className="help-group">
          <h3 className="help-group-title">{group}</h3>

          {group === "Editing" && (
            <EscapeWordField
              escapeInput={escapeInput}
              escapeError={escapeError}
              onEscapeInputChange={onEscapeInputChange}
            />
          )}

          <dl className="help-list">
            {groupDocs.map((doc) => (
              <div key={doc.phrase} className="help-row">
                <dt>
                  <code>{doc.phrase}</code>
                </dt>
                <dd>{doc.description}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </section>
  );
}
