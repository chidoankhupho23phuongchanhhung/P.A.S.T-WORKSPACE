'use client'

import { useState, useTransition, useOptimistic } from 'react'
import type { CreatedTask } from './ConvertToTaskModal'

// ─── Types ────────────────────────────────────────────────────
type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done'

interface TaskCardProps {
  task: CreatedTask
  currentUserId: string
  currentUserRole: 'admin' | 'leader' | 'member'
}

// ─── Status config ────────────────────────────────────────────
const STATUS_CONFIG: Record<TaskStatus, {
  label: string
  icon: string
  color: string
  bg: string
  border: string
  glow: string
  next: TaskStatus | null
  nextLabel: string
}> = {
  todo: {
    label: 'Chưa làm',
    icon: '⏳',
    color: '#94a3b8',
    bg: 'rgba(148,163,184,0.1)',
    border: 'rgba(148,163,184,0.25)',
    glow: 'rgba(148,163,184,0.15)',
    next: 'in_progress',
    nextLabel: '🚀 Nhận việc',
  },
  in_progress: {
    label: 'Đang làm',
    icon: '🔥',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.1)',
    border: 'rgba(245,158,11,0.3)',
    glow: 'rgba(245,158,11,0.2)',
    next: 'review',
    nextLabel: '🔍 Gửi kiểm tra',
  },
  review: {
    label: 'Đang xem xét',
    icon: '🔍',
    color: '#8b5cf6',
    bg: 'rgba(139,92,246,0.1)',
    border: 'rgba(139,92,246,0.3)',
    glow: 'rgba(139,92,246,0.2)',
    next: 'done',
    nextLabel: '✅ Hoàn thành',
  },
  done: {
    label: 'Hoàn thành',
    icon: '✅',
    color: '#10b981',
    bg: 'rgba(16,185,129,0.1)',
    border: 'rgba(16,185,129,0.3)',
    glow: 'rgba(16,185,129,0.2)',
    next: null,
    nextLabel: '',
  },
}

// ─── Due date helpers ─────────────────────────────────────────
function getDueDateInfo(dueDate?: string) {
  if (!dueDate) return null
  const due = new Date(dueDate)
  const now = new Date()
  const diffDays = Math.ceil((due.getTime() - now.setHours(0,0,0,0)) / 86400000)
  const label = due.toLocaleDateString('vi-VN', { day: 'numeric', month: 'short', year: 'numeric' })

  if (diffDays < 0) return { label, urgency: 'overdue', text: `Quá hạn ${-diffDays} ngày`, color: '#ef4444' }
  if (diffDays === 0) return { label, urgency: 'today', text: 'Hôm nay', color: '#f59e0b' }
  if (diffDays <= 2) return { label, urgency: 'soon', text: `Còn ${diffDays} ngày`, color: '#f59e0b' }
  return { label, urgency: 'normal', text: `Còn ${diffDays} ngày`, color: '#94a3b8' }
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

// ─── Task Card Component ──────────────────────────────────────
export default function TaskCard({ task, currentUserId, currentUserRole }: TaskCardProps) {
  const cfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.todo
  const dueDateInfo = getDueDateInfo(task.dueDate)
  const isAssignee = task.assigneeId === currentUserId
  const canChangeStatus = isAssignee || ['admin', 'leader'].includes(currentUserRole)

  const [optimisticStatus, setOptimisticStatus] = useOptimistic(task.status)
  const [isPending, startTransition] = useTransition()
  const [showAllStatuses, setShowAllStatuses] = useState(false)

  const nextStatus = STATUS_CONFIG[optimisticStatus]?.next

  // ── Advance to next status ──────────────────────────────────
  const handleNextStatus = () => {
    if (!nextStatus || !canChangeStatus || isPending) return
    startTransition(async () => {
      setOptimisticStatus(nextStatus)
      try {
        const res = await fetch(`/api/tasks/${task.id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: nextStatus }),
        })
        if (!res.ok) {
          // Rollback handled by useOptimistic
          console.error('Failed to update task status')
        }
      } catch {
        console.error('Network error updating task')
      }
    })
  }

  // ── Pick specific status (admin/leader) ─────────────────────
  const handlePickStatus = (status: TaskStatus) => {
    if (!canChangeStatus || isPending || status === optimisticStatus) return
    setShowAllStatuses(false)
    startTransition(async () => {
      setOptimisticStatus(status)
      try {
        await fetch(`/api/tasks/${task.id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        })
      } catch {
        console.error('Network error')
      }
    })
  }

  const currentCfg = STATUS_CONFIG[optimisticStatus]

  return (
    <>
      <style>{`
        .task-card {
          position: relative;
          border-radius: 16px;
          overflow: hidden;
          font-family: 'Inter', system-ui, sans-serif;
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          transition: box-shadow 200ms ease, transform 200ms ease;
          animation: taskCardAppear 400ms cubic-bezier(0.34,1.56,0.64,1) both;
          max-width: 420px;
        }

        @keyframes taskCardAppear {
          from { opacity: 0; transform: scale(0.9) translateY(8px); }
          to   { opacity: 1; transform: scale(1)   translateY(0); }
        }

        .task-card:hover { transform: translateY(-2px); }

        /* Glowing top accent bar */
        .task-card__accent {
          height: 3px;
          background: linear-gradient(90deg, transparent, var(--accent-color), transparent);
          opacity: 0.8;
        }

        .task-card__body { padding: 16px; }

        .task-card__header {
          display: flex; align-items: flex-start;
          justify-content: space-between; gap: 10px; margin-bottom: 12px;
        }

        .task-card__badge {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 10px; font-weight: 700; letter-spacing: 0.07em;
          text-transform: uppercase; padding: 3px 10px; border-radius: 99px;
          white-space: nowrap;
        }

        .task-card__title {
          font-size: 15px; font-weight: 700; line-height: 1.4;
          color: #f0f4ff; letter-spacing: -0.01em;
          margin-bottom: 6px;
        }

        .task-card__desc {
          font-size: 13px; color: rgba(240,244,255,0.55);
          line-height: 1.5; margin-bottom: 14px;
          display: -webkit-box; -webkit-line-clamp: 2;
          -webkit-box-orient: vertical; overflow: hidden;
        }

        /* Meta row */
        .task-card__meta {
          display: flex; align-items: center;
          gap: 16px; flex-wrap: wrap; margin-bottom: 14px;
        }

        .task-meta-item {
          display: flex; align-items: center; gap: 6px;
          font-size: 12px; color: rgba(240,244,255,0.5);
        }

        .assignee-pill {
          display: flex; align-items: center; gap: 6px;
          padding: 4px 10px 4px 4px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 99px;
          font-size: 12px; font-weight: 500; color: rgba(240,244,255,0.8);
        }

        .assignee-avatar-sm {
          width: 22px; height: 22px; border-radius: 50%;
          display: grid; place-items: center;
          font-size: 9px; font-weight: 700; color: white;
          background: linear-gradient(135deg,#3b82f6,#6366f1);
          border: 1px solid rgba(255,255,255,0.2);
          flex-shrink: 0; overflow: hidden;
        }

        /* Actions */
        .task-card__actions {
          display: flex; align-items: center; gap: 8px;
          position: relative;
        }

        .btn-next-status {
          flex: 1; padding: 9px 16px; border-radius: 10px;
          font-size: 13px; font-weight: 600; color: white;
          display: flex; align-items: center; justify-content: center; gap: 6px;
          transition: transform 150ms cubic-bezier(0.34,1.56,0.64,1), box-shadow 150ms, opacity 150ms;
          position: relative; overflow: hidden;
        }

        .btn-next-status::before {
          content: '';
          position: absolute; inset: 0;
          background: rgba(255,255,255,0.1);
          opacity: 0; transition: opacity 150ms;
        }
        .btn-next-status:hover:not(:disabled)::before { opacity: 1; }
        .btn-next-status:hover:not(:disabled) { transform: scale(1.02); }
        .btn-next-status:active { transform: scale(0.97); }
        .btn-next-status:disabled { opacity: 0.5; cursor: not-allowed; }

        .btn-status-menu {
          padding: 9px 12px; border-radius: 10px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          color: rgba(240,244,255,0.6); font-size: 13px;
          transition: background 150ms, color 150ms;
        }
        .btn-status-menu:hover { background: rgba(255,255,255,0.1); color: #f0f4ff; }

        /* Status dropdown */
        .status-dropdown {
          position: absolute; bottom: calc(100% + 6px); left: 0; right: 0;
          background: rgba(10,15,40,0.97);
          backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          box-shadow: 0 16px 48px rgba(0,0,0,0.6);
          overflow: hidden;
          animation: dropUp 180ms cubic-bezier(0.34,1.56,0.64,1) both;
          z-index: 10;
        }

        @keyframes dropUp {
          from { opacity: 0; transform: translateY(8px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }

        .status-option {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 14px; width: 100%; text-align: left;
          font-size: 13px; font-weight: 500; color: rgba(240,244,255,0.8);
          transition: background 120ms;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .status-option:last-child { border-bottom: none; }
        .status-option:hover { background: rgba(255,255,255,0.06); }
        .status-option[aria-current="true"] {
          background: rgba(255,255,255,0.05);
          color: #f0f4ff; font-weight: 600;
        }
        .status-option-dot {
          width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
        }

        /* Loading shimmer */
        .task-loading {
          position: absolute; inset: 0;
          background: linear-gradient(90deg, transparent 25%, rgba(255,255,255,0.04) 50%, transparent 75%);
          background-size: 200% 100%;
          animation: shimmer 1.2s infinite;
          border-radius: inherit; pointer-events: none;
        }
        @keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }

        /* Done state overlay */
        .task-card--done .task-card__title { text-decoration: line-through; opacity: 0.6; }
      `}</style>

      <div
        className={`task-card ${optimisticStatus === 'done' ? 'task-card--done' : ''}`}
        style={{
          background: currentCfg.bg,
          border: `1px solid ${currentCfg.border}`,
          boxShadow: `0 8px 32px ${currentCfg.glow}, 0 0 0 1px rgba(255,255,255,0.04)`,
          // @ts-ignore CSS custom property
          '--accent-color': currentCfg.color,
        } as React.CSSProperties}
        role="article"
        aria-label={`Thẻ công việc: ${task.title}`}
      >
        {isPending && <div className="task-loading" aria-hidden />}

        {/* Accent top bar */}
        <div
          className="task-card__accent"
          style={{ background: `linear-gradient(90deg, transparent, ${currentCfg.color}, transparent)` }}
          aria-hidden
        />

        <div className="task-card__body">
          {/* Header: badge + status */}
          <div className="task-card__header">
            <span
              className="task-card__badge"
              style={{ background: currentCfg.bg, color: currentCfg.color, border: `1px solid ${currentCfg.border}` }}
            >
              <span aria-hidden>{currentCfg.icon}</span>
              {currentCfg.label}
            </span>
            <span
              className="task-card__badge"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(240,244,255,0.4)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 9 }}
              title="Đây là thẻ công việc"
            >
              🎯 TASK
            </span>
          </div>

          {/* Title */}
          <h3 className="task-card__title">{task.title}</h3>

          {/* Description */}
          {task.description && task.description !== task.title && (
            <p className="task-card__desc">{task.description}</p>
          )}

          {/* Meta: assignee + due date */}
          <div className="task-card__meta">
            {/* Assignee */}
            <div className="assignee-pill" title={`Phụ trách: ${task.assignee.fullName}`}>
              <div className="assignee-avatar-sm" aria-hidden>
                {task.assignee.avatarUrl
                  ? <img src={task.assignee.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : initials(task.assignee.fullName)
                }
              </div>
              <span>{task.assignee.fullName}</span>
            </div>

            {/* Due date */}
            {dueDateInfo && (
              <div
                className="task-meta-item"
                style={{ color: dueDateInfo.color }}
                title={`Hạn chót: ${dueDateInfo.label}`}
                aria-label={`Hạn chót: ${dueDateInfo.label} — ${dueDateInfo.text}`}
              >
                <span aria-hidden>📅</span>
                <span style={{ fontWeight: dueDateInfo.urgency !== 'normal' ? 600 : 400 }}>
                  {dueDateInfo.text}
                </span>
                {dueDateInfo.urgency === 'overdue' && (
                  <span aria-hidden style={{ fontSize: 12 }}>🔴</span>
                )}
              </div>
            )}
          </div>

          {/* Action buttons */}
          {canChangeStatus && optimisticStatus !== 'done' && (
            <div className="task-card__actions">
              {/* Next status button */}
              {nextStatus && (
                <button
                  className="btn-next-status"
                  style={{ background: `linear-gradient(135deg, ${currentCfg.color}cc, ${currentCfg.color}88)` }}
                  onClick={handleNextStatus}
                  disabled={isPending}
                  aria-label={`${currentCfg.nextLabel} — chuyển sang trạng thái ${STATUS_CONFIG[nextStatus].label}`}
                >
                  {isPending
                    ? <><div style={{ width:12,height:12,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'white',borderRadius:'50%',animation:'spin 0.6s linear infinite' }} aria-hidden /><span>Đang lưu...</span></>
                    : currentCfg.nextLabel
                  }
                </button>
              )}

              {/* Status menu (admin/leader only) */}
              {['admin', 'leader'].includes(currentUserRole) && (
                <div style={{ position: 'relative' }}>
                  <button
                    className="btn-status-menu"
                    onClick={() => setShowAllStatuses(v => !v)}
                    aria-haspopup="listbox"
                    aria-expanded={showAllStatuses}
                    aria-label="Chọn trạng thái khác"
                    title="Đổi trạng thái"
                    disabled={isPending}
                  >
                    ⋯
                  </button>

                  {showAllStatuses && (
                    <div
                      className="status-dropdown"
                      role="listbox"
                      aria-label="Chọn trạng thái công việc"
                    >
                      {(Object.entries(STATUS_CONFIG) as [TaskStatus, typeof STATUS_CONFIG[TaskStatus]][]).map(([status, conf]) => (
                        <button
                          key={status}
                          className="status-option"
                          role="option"
                          aria-current={optimisticStatus === status ? 'true' : undefined}
                          onClick={() => handlePickStatus(status)}
                          disabled={status === optimisticStatus}
                        >
                          <div
                            className="status-option-dot"
                            style={{ background: conf.color }}
                            aria-hidden
                          />
                          <span aria-hidden>{conf.icon}</span>
                          {conf.label}
                          {optimisticStatus === status && (
                            <span style={{ marginLeft: 'auto', fontSize: 12, color: conf.color }} aria-hidden>✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Done state */}
          {optimisticStatus === 'done' && (
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', borderRadius: 10,
                background: 'rgba(16,185,129,0.1)',
                border: '1px solid rgba(16,185,129,0.25)',
                fontSize: 13, color: '#10b981', fontWeight: 600,
              }}
              role="status"
            >
              <span aria-hidden>🎉</span> Công việc đã hoàn thành!
            </div>
          )}
        </div>
      </div>
    </>
  )
}
