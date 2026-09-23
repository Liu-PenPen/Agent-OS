import { randomUUID } from "node:crypto";
import type { CliAdapter, CliEvent, CliRunInput } from "./types.js";

const DELAY_MS = 20;

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export class MockCliAdapter implements CliAdapter {
  async *run(input: CliRunInput): AsyncIterable<CliEvent> {
    try {
      if (input.prompt.includes("[clarify]")) {
        yield {
          type: "clarification",
          id: randomUUID(),
          prompt: "Which approach should we take?",
          options: [
            { id: "opt-a", label: "Option A" },
            { id: "opt-b", label: "Option B" },
          ],
        };
        yield { type: "done", sessionId: input.sessionId ?? randomUUID() };
        return;
      }

      const preview = input.prompt.replace(/\s+/g, " ").trim().slice(0, 160);
      const text = `Mock response to: ${preview}`;
      const chunks = text.match(/.{1,8}/g) ?? [text];

      for (const chunk of chunks) {
        await delay(DELAY_MS, input.signal);
        yield { type: "text_delta", text: chunk };
      }
      yield { type: "done", sessionId: input.sessionId ?? randomUUID() };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        yield { type: "error", message: "Aborted" };
        return;
      }
      throw error;
    }
  }
}
