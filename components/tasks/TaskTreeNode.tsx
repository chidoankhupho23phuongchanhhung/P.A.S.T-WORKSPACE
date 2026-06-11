// components/tasks/TaskTreeNode.tsx
'use client'

import { useState } from 'react'
import Image from 'next/image'

export interface Profile {
  id: string
  fullName: string
  avatarUrl: string | null
}

export interface Task {
  id: string
  title: string
  description: string | null
  parentId: string | null
  assigneeId: string | null
  reporterId: string | null
  dueDate: string | null
  status: 'todo' | 'in_progress' | 'review' | 'done'
  assignee?: Profile | null
  reporter?: Profile | null
  createdAt: string
  updatedAt: string
}

interface TaskTreeNodeProps {
  task: Task
  allTasks: Task
  level: number
  onStatusChange: (taskId: string, newStatus: Task['status']) => Promise<void>
  onAddSubtask?: (parentId: string) => void
  userRole?: 'admin' | 'leader' | 'member'
  currentUserId?: string
}

export function TaskTreeNode({
  task,
  allTasks,
  level = 0,
  onStatusChange,
  onAddSubtask,
  userRole = 'member',
  currentUserId,
}: {
  task: Task
  allTasks: Task[]
  level: number
  onStatusChange: (taskId: string, newStatus: Task['status']) => Promise<void>
  onAddSubtask?: (parentId: string) => void
  userRole?: 'admin' | 'leader' | 'member'
  currentUserId?: string
}) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)

  // Find children of this task
  const children = allTasks.filter((t) => t.parentId === task.id)
  const hasChildren = children.length > 0

  // Calculate remaining time for deadline chip
  const getDeadlineUrgency = (dueDateStr: string | null) => {
    if (!dueDateStr) return { label: 'Không hạn chót', style: 'bg-white/5 text-white/50 border-white/10' }
    
    const dueDate = new Date(dueDateStr)
    const now = new Date()
    const diffTime = dueDate.getTime() - now.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    const formattedDate = dueDate.toLocaleDateString('vi-VN', {
      month: 'short',
      day: 'numeric',
    })

    if (diffTime < 0) {
      return { label: `Quá hạn (${formattedDate})`, style: 'bg-red-500/25 border-red-500/40 text-red-200 animate-pulse' }
    } else if (diffDays <= 1) {
      return { label: `Khẩn cấp (${formattedDate})`, style: 'bg-red-400/20 border-red-400/35 text-red-200' }
    } else if (diffDays <= 3) {
      return { label: `Sắp hạn (${formattedDate})`, style: 'bg-amber-500/20 border-amber-500/35 text-amber-200' }
    } else {
      return { label: formattedDate, style: 'bg-blue-500/15 border-blue-500/25 text-blue-200' }
    }
  }

  const deadlineInfo = getDeadlineUrgency(task.dueDate)

  // Get status color styles
  const getStatusStyles = (status: Task['status']) => {
    switch (status) {
      case 'todo':
        return 'bg-white/5 border-white/20 text-white/60'
      case 'in_progress':
        return 'bg-blue-500/20 border-blue-500/30 text-blue-300'
      case 'review':
        return 'bg-purple-500/20 border-purple-500/30 text-purple-300'
      case 'done':
        return 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
    }
  }

  // Next status in flow (for members update)
  const getNextStatus = (current: Task['status']): Task['status'] | null => {
    const FLOW: Record<Task['status'], Task['status'] | null> = {
      todo: 'in_progress',
      in_progress: 'review',
      review: 'done',
      done: null,
    }
    return FLOW[current]
  }

  const nextStatus = getNextStatus(task.status)

  const handleStatusClick = async () => {
    // Check permission
    const isAssignee = task.assigneeId === currentUserId
    const isPrivileged = ['admin', 'leader'].includes(userRole)
    if (!isAssignee && !isPrivileged) return // No permission

    let targetStatus: Task['status']
    if (isPrivileged) {
      // Admins/Leaders toggle status or advance
      const statuses: Task['status'][] = ['todo', 'in_progress', 'review', 'done']
      const currentIndex = statuses.indexOf(task.status)
      targetStatus = statuses[(currentIndex + 1) % statuses.length]
    } else {
      if (!nextStatus) return // Done tasks cannot be advanced further by member
      targetStatus = nextStatus
    }

    try {
      setIsUpdating(true)
      await onStatusChange(task.id, targetStatus)
    } catch (err) {
      console.error(err)
    } finally {
      setIsUpdating(false)
    }
  }

  const canCreateSubtask = ['admin', 'leader'].includes(userRole)
  const canUpdateStatus = (task.assigneeId === currentUserId && task.status !== 'done') || ['admin', 'leader'].includes(userRole)

  return (
    <div className="flex flex-col w-full relative transition-all duration-300">
      {/* Connector lines (rendered only for child levels > 0) */}
      {level > 0 && (
        <div 
          className="absolute left-[-16px] top-[24px] w-[16px] h-[2px] bg-white/10" 
          style={{ borderBottomLeftRadius: '4px' }}
        />
      )}

      {/* Main Task Card */}
      <div 
        className={`w-full group backdrop-blur-md bg-white/5 border border-white/10 rounded-xl p-4 shadow-lg hover:shadow-xl hover:bg-white/10 transition-all duration-200 ease-out`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Title & Description */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {/* Expand/Collapse Toggle */}
              {hasChildren && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                  aria-label={isExpanded ? 'Thu gọn' : 'Mở rộng'}
                >
                  <svg
                    className={`w-4 h-4 transform transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
              <h4 className="text-white font-medium truncate text-sm md:text-base">{task.title}</h4>
            </div>
            {task.description && (
              <p className="text-white/60 text-xs md:text-sm mt-1 pl-1 line-clamp-2">{task.description}</p>
            )}
          </div>

          {/* Google Chips Wrapper */}
          <div className="flex flex-wrap items-center gap-2 mt-2 md:mt-0">
            {/* Assignee Chip */}
            {task.assignee ? (
              <div className="flex items-center gap-1.5 pl-1 pr-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/80">
                {task.assignee.avatarUrl ? (
                  <div className="relative w-4 h-4 rounded-full overflow-hidden">
                    <Image
                      src={task.assignee.avatarUrl}
                      alt={task.assignee.fullName}
                      fill
                      sizes="16px"
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white uppercase">
                    {task.assignee.fullName.charAt(0)}
                  </div>
                )}
                <span className="truncate max-w-[80px]">{task.assignee.fullName}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/5 border border-dashed border-white/15 text-xs text-white/40">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>Chưa giao</span>
              </div>
            )}

            {/* Deadline Chip */}
            <div className={`px-2.5 py-0.5 rounded-full border text-xs ${deadlineInfo.style}`}>
              {deadlineInfo.label}
            </div>

            {/* Status Chip */}
            <button
              disabled={!canUpdateStatus || isUpdating}
              onClick={handleStatusClick}
              className={`px-2.5 py-0.5 rounded-full border text-xs font-semibold capitalize transition-all ${getStatusStyles(
                task.status
              )} ${
                canUpdateStatus 
                  ? 'hover:scale-105 active:scale-95 cursor-pointer hover:bg-white/10' 
                  : 'cursor-not-allowed opacity-80'
              }`}
            >
              {isUpdating ? (
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                task.status.replace('_', ' ')
              )}
            </button>

            {/* Action Menu (Add subtask) */}
            {canCreateSubtask && onAddSubtask && (
              <button
                onClick={() => onAddSubtask(task.id)}
                className="p-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition-colors"
                title="Thêm công việc con"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Children Nodes (Indented) */}
      {hasChildren && isExpanded && (
        <div 
          className="flex flex-col gap-3 pl-6 mt-3 relative before:absolute before:left-[8px] before:top-[-12px] before:bottom-[24px] before:w-[2px] before:bg-white/10"
        >
          {children.map((child) => (
            <TaskTreeNode
              key={child.id}
              task={child}
              allTasks={allTasks}
              level={level + 1}
              onStatusChange={onStatusChange}
              onAddSubtask={onAddSubtask}
              userRole={userRole}
              currentUserId={currentUserId}
            />
          ))}
        </div>
      )}
    </div>
  )
}
