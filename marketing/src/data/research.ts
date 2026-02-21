export interface ResearchConcept {
  number: number;
  slug: string;
  title: string;
  tagline: string;
  layer: 'a' | 'b' | 'c';
  layerTitle: string;
  description: string;
  keywords: string;
}

export const layers = {
  a: { id: 'a', title: 'Human Memory Interaction', subtitle: 'How people interact with memories', range: '1–7' },
  b: { id: 'b', title: 'Agent-Specific Memory', subtitle: 'Memories tied to a specific agent', range: '8–13' },
  c: { id: 'c', title: 'Multi-Agent Orchestration', subtitle: 'Shared pockets of information across agents and people', range: '14–20' },
} as const;

export const concepts: ResearchConcept[] = [
  {
    number: 1,
    slug: 'filing-cabinet',
    title: 'The Filing Cabinet',
    tagline: 'A searchable, filterable table of all memories',
    layer: 'a',
    layerTitle: 'Human Memory Interaction',
    description: 'The spreadsheet of memory. Every learning as a row — sortable, filterable, exportable. The admin view that every system needs but nobody loves.',
    keywords: 'memory table, admin dashboard, CRUD, searchable memories, data management',
  },
  {
    number: 2,
    slug: 'journal',
    title: 'The Journal',
    tagline: 'A chronological timeline of everything remembered',
    layer: 'a',
    layerTitle: 'Human Memory Interaction',
    description: 'Time flows downward. Entries cluster by day or run. The journal makes rhythm visible — when your agent was most active, where the dry spells are.',
    keywords: 'timeline, chronological memory, event stream, activity log, temporal view',
  },
  {
    number: 3,
    slug: 'search-conversation',
    title: 'The Search Conversation',
    tagline: 'Talk to your memory like a colleague',
    layer: 'a',
    layerTitle: 'Human Memory Interaction',
    description: 'Not a search box — a conversation. Ask questions, get synthesized answers drawn from multiple learnings. Surface contradictions, gaps, and connections.',
    keywords: 'conversational search, memory chat, semantic retrieval, synthesis, natural language',
  },
  {
    number: 4,
    slug: 'constellation-map',
    title: 'The Constellation Map',
    tagline: 'See the shape of everything you know',
    layer: 'a',
    layerTitle: 'Human Memory Interaction',
    description: 'A force-directed graph where each memory is a star and semantic similarity draws edges. Dense clusters are well-understood. Empty space is what you don\'t know.',
    keywords: 'knowledge graph, visualization, embedding space, semantic clustering, topology',
  },
  {
    number: 5,
    slug: 'decay-garden',
    title: 'The Decay Garden',
    tagline: 'Memories as living things that bloom and wilt',
    layer: 'a',
    layerTitle: 'Human Memory Interaction',
    description: 'High-confidence memories bloom. Old, unrealled memories wilt. Maintenance feels like gardening, not janitorial work. A health dashboard with soul.',
    keywords: 'memory health, confidence visualization, decay, maintenance, organic metaphor',
  },
  {
    number: 6,
    slug: 'deja-vu-moment',
    title: 'The Déjà Vu Moment',
    tagline: 'Memories that find you, not the other way around',
    layer: 'a',
    layerTitle: 'Human Memory Interaction',
    description: 'Not a dashboard — a notification. When context matches a stored memory, a card appears: "You\'ve been here before." Push-based recall that feels like intuition.',
    keywords: 'push notifications, ambient recall, contextual memory, proactive, IDE integration',
  },
  {
    number: 7,
    slug: 'forgetting-ritual',
    title: 'The Forgetting Ritual',
    tagline: 'Intentional release of memories that no longer serve',
    layer: 'a',
    layerTitle: 'Human Memory Interaction',
    description: 'A weekly practice of reviewing low-confidence memories. Swipe to confirm, release, or rephrase. Forgetting as a generative act — not data loss.',
    keywords: 'memory hygiene, review flow, forgetting, curation, confidence management',
  },
  {
    number: 8,
    slug: 'agents-diary',
    title: 'The Agent\'s Diary',
    tagline: 'Read what your agent believes, in its own words',
    layer: 'b',
    layerTitle: 'Agent-Specific Memory',
    description: 'A narrative synthesis of everything an agent knows. Not raw data — a readable "belief statement" organized by topic. Makes agent memory legible to non-technical stakeholders.',
    keywords: 'agent beliefs, narrative synthesis, agent profile, knowledge summary, transparency',
  },
  {
    number: 9,
    slug: 'memory-debugger',
    title: 'The Memory Debugger',
    tagline: 'Trace exactly why an agent remembered what it did',
    layer: 'b',
    layerTitle: 'Agent-Specific Memory',
    description: 'A waterfall view of a run: context in, embedding generated, memories returned with scores, decisions made, new learnings stored. Printf debugging for cognition.',
    keywords: 'debugging, trace view, similarity scores, memory injection, agent reasoning',
  },
  {
    number: 10,
    slug: 'before-after-diff',
    title: 'The Before/After Diff',
    tagline: 'See exactly how a run changed what an agent knows',
    layer: 'b',
    layerTitle: 'Agent-Specific Memory',
    description: 'Like git diff for knowledge. Green for new learnings, yellow for confidence changes, red for deletions. See the impact of a single run on the entire knowledge base.',
    keywords: 'knowledge diff, run impact, before after, memory changes, learning delta',
  },
  {
    number: 11,
    slug: 'confidence-heatmap',
    title: 'The Confidence Heatmap',
    tagline: 'Where knowledge is strong and where it\'s shaky',
    layer: 'b',
    layerTitle: 'Agent-Specific Memory',
    description: 'All memories arranged by topic and time, colored by confidence. Bright means strong. Dim means uncertain. Find blind spots before they matter.',
    keywords: 'heatmap, confidence visualization, topic analysis, knowledge health, blind spots',
  },
  {
    number: 12,
    slug: 'agents-instinct-panel',
    title: 'The Agent\'s Instinct Panel',
    tagline: 'Watch an agent\'s priors light up in real time',
    layer: 'b',
    layerTitle: 'Agent-Specific Memory',
    description: 'A live sidebar showing what memories are active, what the agent is unsure about, and what decisions are forming. Transparency without interruption.',
    keywords: 'real-time monitoring, agent state, live panel, working memory, transparency',
  },
  {
    number: 13,
    slug: 'learning-proposal-flow',
    title: 'The Learning Proposal Flow',
    tagline: 'Human approval before memories become permanent',
    layer: 'b',
    layerTitle: 'Agent-Specific Memory',
    description: 'Before a learning is stored, a human reviews it. Approve, edit, reject, or redirect scope. Memory with human-in-the-loop — the quality gate for autonomous agents.',
    keywords: 'approval flow, human in the loop, memory governance, quality gate, review',
  },
  {
    number: 14,
    slug: 'memory-commons',
    title: 'The Memory Commons',
    tagline: 'A shared knowledge base that self-corrects',
    layer: 'c',
    layerTitle: 'Multi-Agent Orchestration',
    description: 'Multiple agents and humans contribute to collective knowledge. Endorse what\'s true, challenge what\'s wrong. A wiki where every entry was born from real experience.',
    keywords: 'shared knowledge, collaborative memory, endorsement, wiki, collective intelligence',
  },
  {
    number: 15,
    slug: 'handoff-packet',
    title: 'The Handoff Packet',
    tagline: 'Everything the next agent needs to continue the work',
    layer: 'c',
    layerTitle: 'Multi-Agent Orchestration',
    description: 'When one agent finishes and another starts, a structured briefing bridges the gap. What was known, what was done, what was learned, what\'s uncertain.',
    keywords: 'agent handoff, context transfer, continuity, briefing, multi-agent workflow',
  },
  {
    number: 16,
    slug: 'scope-telescope',
    title: 'The Scope Telescope',
    tagline: 'Zoom from session detail to organizational truth',
    layer: 'c',
    layerTitle: 'Multi-Agent Orchestration',
    description: 'A zoom control for memory. Close up: session-specific tactics. Pull back: agent patterns. Further: shared organizational knowledge. Same insight at different altitudes.',
    keywords: 'scope hierarchy, zoom levels, session agent shared, knowledge abstraction',
  },
  {
    number: 17,
    slug: 'memory-mesh',
    title: 'The Memory Mesh',
    tagline: 'Visualize how knowledge flows between agents',
    layer: 'c',
    layerTitle: 'Multi-Agent Orchestration',
    description: 'A network graph of memory flows. Which agents produce knowledge, which consume it, which learnings travel farthest. Knowledge economics made visible.',
    keywords: 'knowledge flow, agent network, memory provenance, contribution graph',
  },
  {
    number: 18,
    slug: 'contradiction-board',
    title: 'The Contradiction Board',
    tagline: 'Surface and resolve conflicts between memories',
    layer: 'c',
    layerTitle: 'Multi-Agent Orchestration',
    description: 'When two learnings disagree, they appear side by side. Merge, pick one, or create a nuanced version. Coherence as a first-class concern.',
    keywords: 'contradiction detection, conflict resolution, memory coherence, semantic comparison',
  },
  {
    number: 19,
    slug: 'knowledge-tide-pool',
    title: 'The Knowledge Tide Pool',
    tagline: 'A dynamic window of what\'s relevant right now',
    layer: 'c',
    layerTitle: 'Multi-Agent Orchestration',
    description: 'Memories flow in when relevant and flow out when not. A curated, constantly-refreshing subset of collective knowledge for the current task.',
    keywords: 'dynamic relevance, contextual memory, ambient recall, continuous injection',
  },
  {
    number: 20,
    slug: 'mycelial-network',
    title: 'The Mycelial Network',
    tagline: 'Knowledge that emerges from connections, not entries',
    layer: 'c',
    layerTitle: 'Multi-Agent Orchestration',
    description: 'Memory stored as connections between entries. Activate a context and watch knowledge spread through association — surfacing insights no single agent stored.',
    keywords: 'associative memory, knowledge graph, emergent knowledge, network topology, activation spreading',
  },
];

export function getConceptBySlug(slug: string): ResearchConcept | undefined {
  return concepts.find(c => c.slug === slug);
}

export function getAdjacentConcepts(slug: string): { prev: ResearchConcept | null; next: ResearchConcept | null } {
  const idx = concepts.findIndex(c => c.slug === slug);
  return {
    prev: idx > 0 ? concepts[idx - 1] : null,
    next: idx < concepts.length - 1 ? concepts[idx + 1] : null,
  };
}

export function getConceptsByLayer(layer: 'a' | 'b' | 'c'): ResearchConcept[] {
  return concepts.filter(c => c.layer === layer);
}

// Failure modes: scenario-driven, minimal-interface research
export interface FailureMode {
  number: number;
  slug: string;
  title: string;
  tagline: string;
  description: string;
  keywords: string;
}

export const failureModes: FailureMode[] = [
  {
    number: 1,
    slug: 'wrong-thing-recalled',
    title: 'Wrong thing recalled',
    tagline: 'Why did the agent use that memory?',
    description: 'Agent used an outdated or irrelevant memory; the task failed. The minimal interface: last inject for this run — context sent, top-k returned, which one was used.',
    keywords: 'debugging recall, inject trace, wrong memory, stale recall',
  },
  {
    number: 2,
    slug: 'stale-memory-wont-die',
    title: 'Stale memory won\'t die',
    tagline: 'Find and kill one belief',
    description: 'A deprecated or wrong memory keeps getting suggested. The minimal interface: search/filter shared learnings, one row per memory, delete or lower confidence.',
    keywords: 'stale memory, delete memory, confidence, filing cabinet',
  },
  {
    number: 3,
    slug: 'two-memories-conflict',
    title: 'Two memories conflict',
    tagline: 'One rule, not two',
    description: 'Contradictory memories were both injected; agent behavior was inconsistent. The minimal interface: contradiction pairs for shared scope, merge or keep one or scope to context.',
    keywords: 'contradiction, conflict resolution, merge memories',
  },
  {
    number: 4,
    slug: 'new-agent-no-context',
    title: 'New agent has no context',
    tagline: 'What did the previous run know?',
    description: 'Second agent or new run did the wrong thing. The minimal interface: handoff summary for last run — goal, learnings, open questions — and "load into this run."',
    keywords: 'handoff, context transfer, multi-agent, continuity',
  },
  {
    number: 5,
    slug: 'what-does-it-know',
    title: 'What does it know?',
    tagline: 'Audit shared memory by topic',
    description: 'Before trusting the agent in prod: what does it believe about deploys, security, our stack? The minimal interface: topic-clustered list with confidence and last-used.',
    keywords: 'audit, topic clustering, knowledge summary, confidence',
  },
];

export function getFailureModeBySlug(slug: string): FailureMode | undefined {
  return failureModes.find(f => f.slug === slug);
}

export function getAdjacentFailureModes(slug: string): { prev: FailureMode | null; next: FailureMode | null } {
  const idx = failureModes.findIndex(f => f.slug === slug);
  return {
    prev: idx > 0 ? failureModes[idx - 1] : null,
    next: idx < failureModes.length - 1 ? failureModes[idx + 1] : null,
  };
}
