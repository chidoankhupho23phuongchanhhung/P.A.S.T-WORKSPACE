/**
 * components/chat/index.ts
 * Barrel exports — dễ import từ ngoài
 *
 * Usage:
 *   import { ChatWindow, TaskCard, ConvertToTaskModal, MessageWithTaskCard } from '@/components/chat'
 */

export { default as ChatWindow } from './ChatWindow'
export { default as TaskCard } from './TaskCard'
export { default as ConvertToTaskModal } from './ConvertToTaskModal'
export { default as MessageWithTaskCard } from './MessageWithTaskCard'

// Type re-exports
export type { CreatedTask, MemberOption } from './ConvertToTaskModal'
export type { MessageData } from './MessageWithTaskCard'
