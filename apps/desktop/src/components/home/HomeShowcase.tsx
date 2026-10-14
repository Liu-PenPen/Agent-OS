import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { BotConfig, Workspace } from "@ml-aos/shared";
import { botPortrait } from "../../lib/bot-style";

interface HomeShowcaseProps {
  workspace: Workspace | null;
  bots: BotConfig[];
  onEnterWorkspace: () => void;
  onCreateWorkspace: () => void;
}

const TEAM_ORDER = ["ceo", "product", "developer", "tester", "reviewer"] as const;

const ROLE_NAME: Record<(typeof TEAM_ORDER)[number], string> = {
  ceo: "CEO 助理",
  product: "产品经理",
  developer: "开发工程师",
  tester: "测试工程师",
  reviewer: "代码审查",
};

const ROLE_LINE: Record<(typeof TEAM_ORDER)[number], string> = {
  ceo: "调度",
  product: "规格",
  developer: "实现",
  tester: "验收",
  reviewer: "审查",
};

const ROTATE_MS = 2800;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function HomeShowcase({
  workspace,
  bots,
  onEnterWorkspace,
  onCreateWorkspace,
}: HomeShowcaseProps) {
  const team = useMemo(
    () =>
      TEAM_ORDER.map((role, index) => {
        const bot = bots.find((b) => b.role.toLowerCase() === role);
        const name = bot?.name ?? ROLE_NAME[role];
        return {
          role,
          name,
          line: ROLE_LINE[role],
          portrait: botPortrait(bot ?? { name, role }),
          index,
        };
      }),
    [bots],
  );

  const [front, setFront] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || prefersReducedMotion() || team.length < 2) return;
    const id = window.setInterval(() => {
      setFront((current) => (current + 1) % team.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [paused, team.length]);

  const frontRole = team[front]?.role;

  return (
    <div className="showcase-stage">
      <section className="showcase-hero" aria-labelledby="showcase-brand">
        <div className="showcase-copy">
          <p className="showcase-kicker">AI 数字化员工团队协作</p>
          <h1 id="showcase-brand" className="showcase-brand">
            MLAOS
          </h1>
          <p className="showcase-lead">
            自动化AI员工推进工作。工单接入指定AI员工，CEO调度产品、开发、测试与审查推进任务——看清进度，随时停下或继续。
          </p>

          <ol className="showcase-flow" aria-label="流水线顺序">
            {TEAM_ORDER.map((role, index) => (
              <li
                key={role}
                className={
                  role === frontRole
                    ? "showcase-flow-item is-active"
                    : "showcase-flow-item"
                }
              >
                <button
                  type="button"
                  className="showcase-flow-btn"
                  aria-current={role === frontRole ? "true" : undefined}
                  onClick={() => setFront(index)}
                >
                  <span className="showcase-flow-index">{index + 1}</span>
                  <span>{ROLE_LINE[role]}</span>
                </button>
              </li>
            ))}
          </ol>

          <div className="showcase-actions">
            {workspace ? (
              <button
                type="button"
                className="showcase-cta"
                onClick={onEnterWorkspace}
              >
                进入工作区
              </button>
            ) : (
              <button
                type="button"
                className="showcase-cta"
                onClick={onCreateWorkspace}
              >
                创建工作区
              </button>
            )}
          </div>
        </div>

        <div
          className="showcase-cast"
          aria-label="智能体团队"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) {
              setPaused(false);
            }
          }}
        >
          <ul className="showcase-cast-stack">
            {team.map((member) => {
              // front=0 → CEO 在最前，之后按角色顺序轮换
              const slot =
                (member.index - front + team.length - 1) % team.length;
              const isFront = slot === team.length - 1;
              return (
                <li
                  key={member.role}
                  className={
                    isFront
                      ? "showcase-cast-card is-front"
                      : "showcase-cast-card"
                  }
                  style={{ "--cast-i": slot } as CSSProperties}
                >
                  <button
                    type="button"
                    className="showcase-cast-hit"
                    aria-current={isFront ? "true" : undefined}
                    aria-label={`查看 ${member.name}`}
                    onClick={() => setFront(member.index)}
                  >
                    <div className="showcase-cast-photo">
                      {member.portrait ? (
                        <img src={member.portrait} alt="" />
                      ) : (
                        <span aria-hidden>{member.name.slice(0, 1)}</span>
                      )}
                    </div>
                    <div className="showcase-cast-meta">
                      <span className="showcase-cast-name">{member.name}</span>
                      <span className="showcase-cast-line">{member.line}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="showcase-cast-dots" role="tablist" aria-label="切换角色卡">
            {team.map((member) => (
              <button
                key={member.role}
                type="button"
                role="tab"
                aria-selected={member.index === front}
                aria-label={member.name}
                className={
                  member.index === front
                    ? "showcase-cast-dot is-active"
                    : "showcase-cast-dot"
                }
                onClick={() => setFront(member.index)}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
