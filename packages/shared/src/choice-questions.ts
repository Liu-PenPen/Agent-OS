export type ChoiceOption = {
  id: string;
  label: string;
  recommended: boolean;
};

export type ChoiceQuestion = {
  id: string;
  prompt: string;
  options: ChoiceOption[];
};

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function parseOptions(block: string): ChoiceOption[] {
  const source = block.replace(/\*\*/g, "");
  const re =
    /选项\s*([A-Za-z0-9]+)\s*(?:[（(]([^）)]*)[）)])?\s*[:：]\s*([^\n]+)/g;
  const options: ChoiceOption[] = [];
  for (const match of source.matchAll(re)) {
    const key = match[1] ?? "";
    const hint = (match[2] ?? "").trim();
    const title = (match[3] ?? "").replace(/\*\*/g, "").trim();
    const short = hint.replace(/推荐/g, "").replace(/^[\s:：\-]+|[\s:：\-]+$/g, "");
    const label = short ? `${key}. ${short}：${title}` : `${key}. ${title}`;
    options.push({
      id: key.toLowerCase(),
      label: clean(label),
      recommended: /推荐/.test(`${hint}${title}`),
    });
  }
  return options;
}

type ExtractedChoices = {
  questions: ChoiceQuestion[];
  offset: number;
};

/** Pull clickable questions out of a bot reply (agent-os clarification card). */
export function parseChoiceQuestions(text: string): ChoiceQuestion[] {
  return extractChoiceQuestions(text).questions;
}

/** Index where the first choice question starts, so the lead-in can stay above the card. */
export function choiceQuestionOffset(text: string): number {
  return extractChoiceQuestions(text).offset;
}

function extractChoiceQuestions(text: string): ExtractedChoices {
  const source = text.replace(/\r/g, "");
  const questions: ChoiceQuestion[] = [];
  const blocks = [
    ...source.matchAll(
      /问题\s*(\d+)\s*[:：]\s*([^\n]+)([\s\S]*?)(?=问题\s*\d+\s*[:：]|$)/g,
    ),
  ];

  if (blocks.length > 0) {
    for (const block of blocks) {
      const options = parseOptions(block[3] ?? "");
      if (options.length < 2) continue;
      questions.push({
        id: `q${block[1]}`,
        prompt: clean(block[2] ?? ""),
        options,
      });
    }
    const unique = dedupeQuestions(questions);
    return {
      questions: unique,
      offset: unique.length > 0 ? (blocks[0]?.index ?? -1) : -1,
    };
  }

  const lettered = parseLetterQuestions(source);
  if (lettered.questions.length > 0) return lettered;

  const first = source.search(/选项\s*[A-Za-z0-9]+\s*[:：（(]/);
  if (first < 0) return { questions: [], offset: -1 };
  const options = parseOptions(source.slice(first));
  if (options.length < 2) return { questions: [], offset: -1 };
  const before = source.slice(0, first).trim();
  const heading =
    before.split("\n").map((l) => l.trim()).filter(Boolean).at(-1) ??
    "请确认方案";
  questions.push({
    id: "q1",
    prompt: clean(heading.replace(/^[#>*\-\d.\s]+/, "")),
    options,
  });
  return { questions: dedupeQuestions(questions), offset: first };
}

function parseLetterQuestions(source: string): ExtractedChoices {
  const heading =
    /(?:^|\n)([ \t]*(?:#{1,6}[ \t]+)?(?:\*\*)?(\d+)[.、．][ \t]*([^\n*]+?)(?:\*\*)?[ \t]*)(?=\n|$)/g;
  const heads = [...source.matchAll(heading)];
  const questions: ChoiceQuestion[] = [];
  let offset = -1;
  for (let i = 0; i < heads.length; i++) {
    const head = heads[i];
    if (!head) continue;
    const line = head[1] ?? "";
    const start = (head.index ?? 0) + (head[0].startsWith("\n") ? 1 : 0);
    const next = heads[i + 1];
    const body = source.slice(start + line.length, next?.index ?? source.length);
    const options = parseLetterOptions(body);
    if (options.length < 2) continue;
    if (offset < 0) offset = start;
    questions.push({
      id: `q${head[2]}`,
      prompt: clean((head[3] ?? "").replace(/\*\*/g, "").replace(/[:：]\s*$/, "")),
      options,
    });
  }
  return { questions: dedupeQuestions(questions), offset };
}

function parseLetterOptions(block: string): ChoiceOption[] {
  const re =
    /(?:^|\n)[ \t]*(?:[-*][ \t]+)?(?:\*\*)?([A-Za-z])[.、．][ \t]+([^\n]+)/g;
  const options: ChoiceOption[] = [];
  for (const match of block.matchAll(re)) {
    const key = (match[1] ?? "").toUpperCase();
    const expected = String.fromCharCode("A".charCodeAt(0) + options.length);
    if (key !== expected) continue;
    const title = (match[2] ?? "").replace(/\*\*/g, "").trim();
    options.push({
      id: key.toLowerCase(),
      label: clean(`${key}. ${title}`),
      recommended: /推荐/.test(title),
    });
  }
  return options;
}

function dedupeQuestions(questions: ChoiceQuestion[]): ChoiceQuestion[] {
  const seen = new Set<string>();
  const unique: ChoiceQuestion[] = [];
  for (const question of questions) {
    if (seen.has(question.prompt)) continue;
    seen.add(question.prompt);
    unique.push(question);
  }
  return unique;
}

export function formatChoiceAnswers(
  questions: ChoiceQuestion[],
  picks: Record<string, string>,
): string {
  return questions
    .map((q, index) => {
      const opt = q.options.find((o) => o.id === picks[q.id]);
      return `${index + 1}. ${q.prompt}：${opt?.label ?? picks[q.id] ?? "未选"}`;
    })
    .join("\n");
}
