/**
 * ViewSwitch.tsx — rendered or raw.
 *
 * The two views are the same document in two forms, so the control is a switch
 * with a sliding thumb rather than two buttons: nothing changes but the shape.
 */

export type OutputView = "rendered" | "raw";

interface ViewSwitchProps {
  view: OutputView;
  onViewChange: (view: OutputView) => void;
}

export function ViewSwitch({ view, onViewChange }: ViewSwitchProps) {
  return (
    <div className="switch" role="group" aria-label="Output view">
      <span className={view === "rendered" ? "switch-thumb" : "switch-thumb switch-thumb-raw"} />
      <button
        type="button"
        className="switch-option"
        aria-pressed={view === "rendered"}
        onClick={() => onViewChange("rendered")}
      >
        Rendered
      </button>
      <button
        type="button"
        className="switch-option"
        aria-pressed={view === "raw"}
        onClick={() => onViewChange("raw")}
      >
        Raw
      </button>
    </div>
  );
}
