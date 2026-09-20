export type CliEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool"; name: string; input?: unknown }
  | { type: "done"; sessionId?: string }
  | { type: "error"; message: string }
  | {
      type: "clarification";
      id: string;
      prompt: string;
      options: { id: string; label: string }[];
    };

export interface CliRunInput {
  prompt: string;
  cwd: string;
  sessionId?: string;
  signal?: AbortSignal;
}

export interface CliAdapter {
  run(input: CliRunInput): AsyncIterable<CliEvent>;
}
