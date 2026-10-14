import { useNavigate } from "react-router-dom";
import { useShell } from "../lib/shell-context";
import { HomeShowcase } from "../components/home/HomeShowcase";

export function LandingPage() {
  const navigate = useNavigate();
  const { workspace, topics, bots, selectTopic } = useShell();

  function handleEnterWorkspace() {
    if (!workspace) {
      navigate("/workspaces/new");
      return;
    }
    if (topics.length > 0) {
      selectTopic(topics[0].id);
    }
    navigate("/workspace");
  }

  return (
    <div className="landing-screen">
      <header className="landing-nav">
        <div className="landing-nav-left">
          <div className="brand">
            <img className="brand-logo" src="/logo.png" alt="" />
            <span className="brand-name">MLAOS</span>
            <span className="brand-divider" aria-hidden />
            <span className="brand-slogan">智能体操作系统</span>
          </div>
        </div>
      </header>

      <main className="landing-content">
        <HomeShowcase
          workspace={workspace}
          bots={bots}
          onEnterWorkspace={handleEnterWorkspace}
          onCreateWorkspace={() => {
            navigate("/workspaces/new");
          }}
        />
      </main>
    </div>
  );
}
