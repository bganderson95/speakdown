import { describe, expect, it } from "vitest";
import { createTextInput } from "./textInput.js";

describe("createTextInput", () => {
  it("starts with the initial transcript", () => {
    expect(createTextInput("hello").getTranscript()).toBe("hello");
    expect(createTextInput().getTranscript()).toBe("");
  });

  it("notifies subscribers when the transcript changes", () => {
    const source = createTextInput();
    const seen: string[] = [];
    source.subscribe((transcript) => seen.push(transcript));

    source.setTranscript("one");
    source.setTranscript("one two");

    expect(seen).toEqual(["one", "one two"]);
    expect(source.getTranscript()).toBe("one two");
  });

  it("stops notifying after unsubscribe", () => {
    const source = createTextInput();
    const seen: string[] = [];
    const unsubscribe = source.subscribe((transcript) => seen.push(transcript));

    source.setTranscript("one");
    unsubscribe();
    source.setTranscript("two");

    expect(seen).toEqual(["one"]);
  });
});
