import { MessageList } from "../components/chat/MessageList";
import { Composer } from "../components/chat/Composer";
import { useShell } from "../lib/shell-context";
import { BotAvatar } from "../components/BotAvatar";
import { useNavigate } from "react-router-dom";

export function HomePage() {
  const navigate = useNavigate();
  const {
    selectedTopic,
    createTopic,
    messages,
    bots,
    enabledBots,
    workspace,
    sendMessage,
    abortTopic,
    answerClarification,
    decideControl,
    sending,
    error,
  } = useShell();

  if (!workspace) {
    return (
      <div className="home-center workspace-empty-view">
        <div className="workspace-empty-card">
          <div className="workspace-empty-icon">📁</div>
          <h2>暂无挂载工作区</h2>
          <p className="muted">请先创建或选择一个本地代码仓库工作区开始协作。</p>
          <div className="workspace-empty-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={() => navigate("/workspaces/new")}
            >
              新建工作区
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => navigate("/")}
            >
              返回封面首页
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!selectedTopic) {
    return (
      <div className="home-center workspace-empty-view">
        <div className="workspace-empty-card">
          <div className="workspace-empty-icon">💬</div>
          <h2>工作区：{workspace.name}</h2>
          <p className="muted">
            请从左侧栏选择已有话题，或直接创建新话题与 AI 研发团队对话。
          </p>
          <div className="workspace-empty-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                void createTopic("新需求话题");
              }}
            >
              🚀 新建需求话题
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => navigate("/")}
            >
              返回封面首页
            </button>
          </div>
        </div>
      </div>
    );
  }

  const agents = enabledBots.length > 0 ? enabledBots : bots;

  return (
    <div className="home-center">
      <header className="topic-header">
        <div className="topic-header-left">
          <h1 title={selectedTopic.title}>{selectedTopic.title}</h1>
          <div className="topic-agent-stack" aria-label="智能体">
            {agents.slice(0, 4).map((bot) => (
              <BotAvatar key={bot.id} bot={bot} title={bot.name} />
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
        </div>
      </header>
      <MessageList
        messages={messages}
        bots={bots}
        onAnswerClarification={answerClarification}
        onDecideControl={(topicId, decision) => {
          void decideControl(topicId, decision);
        }}
        onAbort={() => {
          void abortTopic();
        }}
      />
      <Composer
        bots={enabledBots}
        sending={sending}
        onSend={sendMessage}
        onAbort={abortTopic}
      />
    </div>
  );
}
