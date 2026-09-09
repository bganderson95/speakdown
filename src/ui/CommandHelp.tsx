/**
 * CommandHelp.tsx — the command vocabulary, rendered as the user would say it.
 *
 * Generated from describeCommands() and the live config, so the help updates
 * with the escape word and can never describe a command the parser does not
 * accept.
 */

import type { CommandDoc, ParserConfig } from "../parser/commands.js";
import { describeCommands } from "../parser/commands.js";

interface CommandHelpProps {
  config: ParserConfig;
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

  return groups;
}

export function CommandHelp({ config }: CommandHelpProps) {
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
