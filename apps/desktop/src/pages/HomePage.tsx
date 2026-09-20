import { MessageList } from "../components/chat/MessageList";
import { Composer } from "../components/chat/Composer";
import { useShell } from "../lib/shell-context";

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
          <h1>No workspace</h1>
          <p className="muted">
            Create a workspace from the sidebar to start chatting.
          </p>
        </header>
      </div>
    );
  }

  if (!selectedTopic) {
    return (
      <div className="home-center">
        <header className="topic-header">
          <h1>{workspace.name}</h1>
          <p className="muted">Create a topic in the sidebar to begin.</p>
        </header>
      </div>
    );
  }

  return (
    <div className="home-center">
      <header className="topic-header">
        <h1>{selectedTopic.title}</h1>
        <p className="muted">
          {workspace.name} · {selectedTopic.pipelineStage}
          {error ? ` · ${error}` : ""}
        </p>
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
