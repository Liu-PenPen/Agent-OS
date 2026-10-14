import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  BotConfig,
  ChatMessage,
  PipelineTask,
  Topic,
  Workspace,
} from "@ml-aos/shared";
import { api } from "./api";
import { connectWs } from "./ws";

export type ShellContextValue = {
  workspaces: Workspace[];
  workspace: Workspace | null;
  setWorkspaceId: (id: string) => void;
  topics: Topic[];
  selectedTopicId: string | null;
  selectedTopic: Topic | null;
  selectTopic: (id: string | null) => void;
  createTopic: (title?: string) => Promise<Topic | null>;
  deleteTopic: (id: string) => Promise<boolean>;
  messages: ChatMessage[];
  bots: BotConfig[];
  enabledBots: BotConfig[];
  pipeline: PipelineTask | null;
  pendingCount: number;
  pendingPreview: ChatMessage | null;
  topicPendingIds: Set<string>;
  sendMessage: (content: string, mentionBotId?: string) => Promise<void>;
  abortTopic: () => Promise<void>;
  answerClarification: (clarificationId: string, optionId: string) => Promise<void>;
  decideControl: (
    topicId: string,
    decision: {
      token: string;
      action: "clarification" | "spec" | "approval" | "visual";
      answer?: string;
      decision?: "approved" | "rejected" | "false_positive" | "confirmed";
    },
  ) => Promise<void>;
  refreshAll: () => Promise<void>;
  refreshPending: () => Promise<void>;
  sending: boolean;
  error: string | null;
  rightPanelCollapsed: boolean;
  toggleRightPanel: () => void;
};

const ShellContext = createContext<ShellContextValue | null>(null);

type WsPayload =
  | { type: "message.upsert"; message: ChatMessage }
  | {
      type: "pipeline.update";
      topicId: string;
      pipelineStage: Topic["pipelineStage"];
    };

export function ShellProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [bots, setBots] = useState<BotConfig[]>([]);
  const [pipeline, setPipeline] = useState<PipelineTask | null>(null);
  const [pending, setPending] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(() => {
    try {
      return localStorage.getItem("ml-aos.rightPanelCollapsed") === "1";
    } catch {
      return false;
    }
  });

  const toggleRightPanel = useCallback(() => {
    setRightPanelCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("ml-aos.rightPanelCollapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const workspace = useMemo(
    () => workspaces.find((w) => w.id === workspaceId) ?? null,
    [workspaces, workspaceId],
  );

  const selectedTopic = useMemo(
    () => topics.find((t) => t.id === selectedTopicId) ?? null,
    [topics, selectedTopicId],
  );

  const enabledBots = useMemo(() => bots.filter((b) => b.enabled), [bots]);

  const topicPendingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const msg of pending) {
      ids.add(msg.topicId);
    }
    return ids;
  }, [pending]);

  const pendingPreview = pending[0] ?? null;
  const pendingCount = pending.length;

  const selectedTopicIdRef = useRef(selectedTopicId);
  selectedTopicIdRef.current = selectedTopicId;

  const upsertMessage = useCallback((message: ChatMessage) => {
    setMessages((prev) => {
      if (message.topicId !== selectedTopicIdRef.current) return prev;
      const index = prev.findIndex((m) => m.id === message.id);
      if (index === -1) {
        return [...prev, message].sort((a, b) =>
          a.createdAt.localeCompare(b.createdAt),
        );
      }
      const next = [...prev];
      next[index] = message;
      return next;
    });
  }, []);

  const refreshPending = useCallback(async () => {
    const list = await api.listClarifications("pending");
    setPending(list);
  }, []);

  const refreshTopics = useCallback(async (wsId?: string | null) => {
    const id = wsId ?? workspaceId;
    const list = await api.listTopics(id ?? undefined);
    setTopics(list);
    return list;
  }, [workspaceId]);

  const loadMessages = useCallback(async (topicId: string) => {
    const list = await api.listMessages(topicId);
    setMessages(list);
  }, []);

  const loadPipeline = useCallback(async (topic: Topic | null) => {
    if (!topic?.pipelineTaskId) {
      setPipeline(null);
      return;
    }
    try {
      const task = await api.getPipeline(topic.pipelineTaskId);
      setPipeline(task);
    } catch {
      setPipeline(null);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setError(null);
    try {
      const [wsList, botList] = await Promise.all([
        api.listWorkspaces(),
        api.listBots(),
      ]);
      setWorkspaces(wsList);
      setBots(botList);

      const nextWsId =
        workspaceId && wsList.some((w) => w.id === workspaceId)
          ? workspaceId
          : (wsList[0]?.id ?? null);
      if (nextWsId !== workspaceId) {
        setWorkspaceId(nextWsId);
      }

      const topicList = await api.listTopics(nextWsId ?? undefined);
      setTopics(topicList);

      const nextTopicId =
        selectedTopicId && topicList.some((t) => t.id === selectedTopicId)
          ? selectedTopicId
          : (topicList[0]?.id ?? null);
      if (nextTopicId !== selectedTopicId) {
        setSelectedTopicId(nextTopicId);
      }

      if (nextTopicId) {
        await loadMessages(nextTopicId);
        const topic = topicList.find((t) => t.id === nextTopicId) ?? null;
        await loadPipeline(topic);
      } else {
        setMessages([]);
        setPipeline(null);
      }

      await refreshPending();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "加载工作台失败");
    }
  }, [
    workspaceId,
    selectedTopicId,
    loadMessages,
    loadPipeline,
    refreshPending,
  ]);

  useEffect(() => {
    void refreshAll();
    // Initial bootstrap only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep bot roster + pending queue fresh after seed / settings edits / runtime restart.
  useEffect(() => {
    const refreshBots = () => {
      void api.listBots().then(setBots).catch(() => {});
    };
    const refreshShell = () => {
      refreshBots();
      void refreshPending();
    };
    const onFocus = () => refreshShell();
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshShell();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(refreshShell, 15_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [refreshPending]);

  useEffect(() => {
    if (!selectedTopicId) {
      setMessages([]);
      setPipeline(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = await api.listMessages(selectedTopicId);
        if (!cancelled) setMessages(list);
        const topicList = await api.listTopics(workspaceId ?? undefined);
        if (cancelled) return;
        setTopics(topicList);
        const topic = topicList.find((t) => t.id === selectedTopicId) ?? null;
        await loadPipeline(topic);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "加载话题失败");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedTopicId, workspaceId, loadPipeline]);

  useEffect(() => {
    const ws = connectWs(
      (raw) => {
        const event = raw as WsPayload;
        if (!event || typeof event !== "object" || !("type" in event)) return;

        if (event.type === "message.upsert") {
          upsertMessage(event.message);
          if (
            event.message.kind === "clarification" ||
            event.message.kind === "app-tool" ||
            event.message.author === "system"
          ) {
            void refreshPending();
          }
          return;
        }

        if (event.type === "pipeline.update") {
          setTopics((prev) =>
            prev.map((t) =>
              t.id === event.topicId
                ? { ...t, pipelineStage: event.pipelineStage }
                : t,
            ),
          );
          if (event.topicId === selectedTopicIdRef.current) {
            void refreshTopics().then((list) => {
              const topic = list.find((t) => t.id === event.topicId) ?? null;
              void loadPipeline(topic);
            });
          }
        }
      },
      () => {
        const topicId = selectedTopicIdRef.current;
        if (!topicId) return;
        void api.listMessages(topicId).then(setMessages).catch(() => undefined);
      },
    );
    return () => {
      ws.close();
    };
  }, [upsertMessage, refreshPending, refreshTopics, loadPipeline]);

  const selectTopic = useCallback((id: string | null) => {
    setSelectedTopicId(id);
  }, []);

  const createTopic = useCallback(
    async (title?: string) => {
      if (!workspaceId) {
        setError("请先创建工作区");
        return null;
      }
      setError(null);
      try {
        const topic = await api.createTopic({
          workspaceId,
          title: title?.trim() || "新话题",
        });
        const list = await refreshTopics(workspaceId);
        setSelectedTopicId(topic.id);
        setTopics(list.some((t) => t.id === topic.id) ? list : [topic, ...list]);
        return topic;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "创建话题失败");
        return null;
      }
    },
    [workspaceId, refreshTopics],
  );

  const deleteTopic = useCallback(
    async (id: string) => {
      setError(null);
      const current = topics.find((t) => t.id === id);
      if (!current) return false;
      const index = topics.findIndex((t) => t.id === id);
      try {
        await api.deleteTopic(id);
        const list = await refreshTopics();
        if (selectedTopicId === id) {
          const neighbor = list[index] ?? list[index - 1] ?? null;
          setSelectedTopicId(neighbor?.id ?? null);
          if (!neighbor) {
            setMessages([]);
            setPipeline(null);
          }
        }
        await refreshPending();
        return true;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "删除话题失败");
        return false;
      }
    },
    [topics, selectedTopicId, refreshTopics, refreshPending],
  );

  const sendMessage = useCallback(
    async (content: string, mentionBotId?: string) => {
      if (!selectedTopicId) return;
      setSending(true);
      setError(null);
      try {
        const created = await api.sendMessage(selectedTopicId, {
          content,
          mentionBotId,
        });
        for (const msg of created) {
          upsertMessage(msg);
        }
        void refreshPending();
        void refreshTopics().then(async (list) => {
          const topic = list.find((t) => t.id === selectedTopicId) ?? null;
          await loadPipeline(topic);
        });
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "发送失败");
      } finally {
        setSending(false);
      }
    },
    [
      selectedTopicId,
      upsertMessage,
      refreshPending,
      refreshTopics,
      loadPipeline,
    ],
  );

  const abortTopic = useCallback(async () => {
    if (!selectedTopicId) return;
    setError(null);
    const stoppedAt = new Date().toISOString();
    setMessages((prev) =>
      prev.map((message) => {
        const live =
          message.streaming || message.run?.status === "running";
        if (!live) return message;
        return {
          ...message,
          streaming: false,
          content: message.content.trim() ? message.content : "任务已停止。",
          run: message.run
            ? {
                ...message.run,
                status: "cancelled",
                current: "已停止",
                finishedAt: stoppedAt,
              }
            : message.run,
        };
      }),
    );
    try {
      await api.abortTopic(selectedTopicId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "中止失败");
    }
  }, [selectedTopicId]);

  const answerClarification = useCallback(
    async (clarificationId: string, optionId: string) => {
      setError(null);
      try {
        const updated = await api.answerClarification(clarificationId, optionId);
        upsertMessage(updated);
        await refreshPending();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "答复失败");
      }
    },
    [upsertMessage, refreshPending],
  );

  const decideControl = useCallback(
    async (
      topicId: string,
      decision: {
        token: string;
        action: "clarification" | "spec" | "approval" | "visual";
        answer?: string;
        decision?: "approved" | "rejected" | "false_positive" | "confirmed";
      },
    ) => {
      setError(null);
      try {
        await api.answerControl(topicId, decision);
        await refreshPending();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "确认卡提交失败");
      }
    },
    [refreshPending],
  );

  const value: ShellContextValue = {
    workspaces,
    workspace,
    setWorkspaceId: (id) => {
      setWorkspaceId(id);
      setSelectedTopicId(null);
      void api.listTopics(id).then((list) => {
        setTopics(list);
        setSelectedTopicId(list[0]?.id ?? null);
      });
    },
    topics,
    selectedTopicId,
    selectedTopic,
    selectTopic,
    createTopic,
    deleteTopic,
    messages,
    bots,
    enabledBots,
    pipeline,
    pendingCount,
    pendingPreview,
    topicPendingIds,
    sendMessage,
    abortTopic,
    answerClarification,
    decideControl,
    refreshAll,
    refreshPending,
    sending,
    error,
    rightPanelCollapsed,
    toggleRightPanel,
  };

  return (
    <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
  );
}

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) {
    throw new Error("useShell must be used within ShellProvider");
  }
  return ctx;
}
