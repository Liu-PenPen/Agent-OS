import type { TicketItem, TicketProject, TicketSprintGroup } from "./ticket-types";

export const MOCK_TICKET_PROJECTS: TicketProject[] = [
  {
    id: "hangyan",
    name: "航研所项目",
    programId: "818309",
    ident: "PJ20251201",
    localPath: "E:\\\\Python_Project\\\\ml-aos",
    defaultEngine: "claude",
    cast: ["ceo", "product", "developer", "tester", "reviewer"],
  },
  {
    id: "aos-core",
    name: "AOS Core",
    programId: "900001",
    ident: "PJ20260301",
    localPath: undefined,
    defaultEngine: "codex",
    cast: ["ceo", "developer", "tester"],
  },
];

export const MOCK_TICKETS: TicketItem[] = [
  {
    id: 101,
    ident: "IHY-128",
    title: "登录页支持邮箱验证码",
    stateTitle: "待办",
    sprintId: 1,
    sprintTitle: "Sprint 12 · 认证体验",
    programId: "818309",
    url: "https://e.gitee.com/example/issues/IHY-128",
    priority: "紧急",
    priorityRank: 0,
  },
  {
    id: 102,
    ident: "IHY-131",
    title: "工单派发后写入话题来源元数据",
    stateTitle: "待办",
    sprintId: 1,
    sprintTitle: "Sprint 12 · 认证体验",
    programId: "818309",
    url: "https://e.gitee.com/example/issues/IHY-131",
    priority: "主要",
    priorityRank: 10,
    topicId: "topic-demo",
    pipelineStage: "developing",
  },
  {
    id: 103,
    ident: "IHY-140",
    title: "右栏工单状态浮层展示引擎与目录",
    stateTitle: "待办",
    sprintId: 2,
    sprintTitle: "Sprint 13 · 桌面工作台",
    programId: "818309",
    url: "https://e.gitee.com/example/issues/IHY-140",
    priority: "次要",
    priorityRank: 20,
  },
  {
    id: 201,
    ident: "AOS-22",
    title: "压缩会话 /compact 对齐 Codex",
    stateTitle: "待办",
    sprintId: 3,
    sprintTitle: "未规划",
    programId: "900001",
    url: "https://e.gitee.com/example/issues/AOS-22",
    priority: "主要",
    priorityRank: 10,
  },
];

export function groupTicketsBySprint(tickets: TicketItem[]): TicketSprintGroup[] {
  const map = new Map<string, TicketItem[]>();
  for (const ticket of tickets) {
    const key = ticket.sprintTitle || "未规划";
    const list = map.get(key) ?? [];
    list.push(ticket);
    map.set(key, list);
  }
  return [...map.entries()].map(([sprintTitle, items]) => ({
    sprintTitle,
    tickets: items,
  }));
}
