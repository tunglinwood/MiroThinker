// TypeScript type definitions for MiroThinker API

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface FileInfo {
  file_id: string;
  file_name: string;
  file_type: string;
  absolute_file_path: string;
}

export interface Task {
  id: string;
  task_description: string;
  agent_config: string;
  llm_config: string;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
  current_turn: number;
  max_turns: number;
  step_count: number;
  final_answer: string | null;
  summary: string | null;
  error_message: string | null;
  file_info: FileInfo | null;
  log_path: string | null;
}

export interface TaskCreate {
  task_description: string;
  agent_config?: string;
  llm_config?: string;
  file_id?: string;
}

export interface Message {
  role: string;
  content: string;
}

// SSE tool call — paired by tool_call_id (request then result)
export interface SseToolCall {
  tool_call_id: string;
  tool_name: string;
  server_name: string;
  turn: number;
  input: Record<string, unknown> | null;   // query args from request event
  result: string | null;                    // result JSON string from response event
  status: 'pending' | 'running' | 'completed' | 'error';
  duration_ms?: number;                     // execution time in milliseconds
}

export interface LogEntry {
  type: string;
  tool_name?: string;
  server_name?: string;
  tool_call_id?: string;
  input?: string;
  output?: string;
  sub_agent_name?: string;  // Set when log originates from a sub-agent
}

export interface TaskStatusUpdate {
  id: string;
  status: TaskStatus;
  current_turn: number;
  step_count: number;
  recent_logs: LogEntry[];
  messages: Message[];
  final_answer: string | null;
  summary: string | null;
  error_message: string | null;
}

export interface TaskListResponse {
  tasks: Task[];
  total: number;
  page: number;
  page_size: number;
}

export interface ConfigListResponse {
  configs: string[];
  default: string;
  agent_configs?: string[];
  llm_configs?: string[];
  default_agent?: string;
  default_llm?: string;
}

export interface UploadResponse {
  file_id: string;
  file_name: string;
  file_type: string;
  absolute_file_path: string;
}

// Parsed message content types
export interface ParsedToolCall {
  server_name: string;
  tool_name: string;
  args: string;
  result?: string;
  type: 'search' | 'code' | 'read' | 'reasoning' | 'default';
}

export interface ParsedMessage {
  thinking: string | null;
  toolCalls: ParsedToolCall[];
  text: string;
}

// SSE event types
export interface SSEEvent {
  event: string;
  data: unknown;
}

// Telemetry types for detailed task analytics
export interface ToolCallTelemetry {
  tool_name: string;
  server_name: string;
  arguments: Record<string, unknown>;
  duration_ms: number;
  success: boolean;
  result_preview: string;
}

export interface TurnTelemetry {
  turn: number;
  input_tokens: number;
  output_tokens: number;
  context_tokens: number;
  context_limit: number;
  tool_calls: ToolCallTelemetry[];
  message_retention: string;
  response_status: string;
  duration_ms?: number;
}

export interface TaskTelemetry {
  total_input_tokens: number;
  total_output_tokens: number;
  context_limit: number;
  turns: TurnTelemetry[];
  env_info: Record<string, unknown>;
  duration_seconds: number;
  tool_usage_summary: Record<string, number>;
  start_time: string;
  end_time: string;
}

// Parsed search result item
export interface SearchResultItem {
  title?: string;
  link?: string;
  url?: string;
  snippet?: string;
  source?: string;
}

// Parsed Python execution result
export interface PythonExecutionResult {
  success?: boolean;
  output?: string;
  error?: string;
  charts?: string[];
}

// Admin dashboard types
export interface ServiceStatus {
  status: string;
  response_time_ms?: number;
  url?: string;
  details?: string;
}

export interface AdminHealthResponse {
  status: string;
  version: string;
  services: Record<string, ServiceStatus>;
  active_tasks: number;
  total_users: number;
  uptime_seconds: number;
}

export interface AdminUser {
  username: string;
  total_tasks: number;
  active_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  last_active: string;
}

export interface AdminUsersResponse {
  users: AdminUser[];
}

export interface AdminTaskListResponse {
  tasks: Task[];
  total: number;
  page: number;
  page_size: number;
}

// Sub-agent execution state
export interface SubAgentState {
  id: string;
  name: string;
  taskDescription: string;
  status: 'running' | 'completed' | 'failed';
  messages: Message[];
  toolCalls: SseToolCall[];
  currentTurn: number;
  stepCount: number;
  result: string | null;
}

// Active sub-agents list (for parallel dispatch)
export interface SubAgentTab {
  id: string;
  name: string;
  taskDescription: string;
  status: 'running' | 'completed' | 'failed';
  messages: Message[];
  toolCalls: SseToolCall[];
  currentTurn: number;
  stepCount: number;
  result: string | null;
  activeTab: boolean;
}
