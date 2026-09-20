import { MessageList } from "../components/chat/MessageList";
import { Composer } from "../components/chat/Composer";
import { useShell } from "../lib/shell-context";
import { botInitial, botTone } from "../lib/bot-style";

export function HomePage() {
  const {
    selectedTopic,
    messages,
    bots,
    enabledBots,
    workspace,
    sendMessage,
    abortTopic,
    dispatchTopic,
    answerClarification,
    sending,
    error,
  } = useShell();

  if (!workspace) {
    return (
      <div className="home-center">
        <header className="topic-header">
          <div>
            <h1>暂无工作区</h1>
            <p className="muted">请从侧边栏新建工作区后再开始对话。</p>
          </div>
        </header>
      </div>
    );
  }

  if (!selectedTopic) {
    return (
      <div className="home-center">
        <header className="topic-header">
          <div>
            <h1>{workspace.name}</h1>
            <p className="muted">在侧边栏新建话题后即可开始。</p>
          </div>
        </header>
      </div>
    );
  }

  const agents = enabledBots.length > 0 ? enabledBots : bots;

  return (
    <div className="home-center">
      <header className="topic-header">
        <div className="topic-header-left">
          <h1>{selectedTopic.title}</h1>
          <div className="topic-agent-stack" aria-label="智能体">
            {agents.slice(0, 4).map((bot) => (
              <span
                key={bot.id}
                className={`agent-avatar tone-${botTone(bot)}`}
                title={bot.name}
              >
                {botInitial(bot)}
              </span>
            ))}
          </div>
          {error ? <span className="topic-error">{error}</span> : null}
        </div>
        <div className="topic-header-actions">
          <button
            type="button"
            className="btn-ghost abort-btn"
            onClick={() => void abortTopic()}
          >
            中止进程
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void dispatchTopic(selectedTopic.title)}
          >
            启动流水线
          </button>
        </div>
      </header>
      <MessageList
        messages={messages}
        bots={bots}
        onAnswerClarification={answerClarification}
      />
      <Composer
        bots={enabledBots}
        sending={sending}
        onSend={sendMessage}
        onAbort={abortTopic}
        onDispatch={() => {
          void dispatchTopic(selectedTopic.title);
        }}
      />
    </div>
  );
}
