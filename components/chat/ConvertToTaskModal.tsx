'use client'

import { useEffect, useRef, useState, useTransition } from 'react'

// ─── Types ────────────────────────────────────────────────────
export interface MemberOption {
  id: string
  fullName: string
  avatarUrl?: string
  role: 'admin' | 'leader' | 'member'
}

interface ConvertToTaskModalProps {
  isOpen: boolean
  onClose: () => void
  messageId: string
  messageContent: string
  channelId: string
  currentUserId: string
  currentUserRole: 'admin' | 'leader' | 'member'
  members: MemberOption[]
  onSuccess: (task: CreatedTask) => void
}

export interface CreatedTask {
  id: string
  title: string
  description?: string
  assigneeId: string
  assignee: Pick<MemberOption, 'id' | 'fullName' | 'avatarUrl'>
  dueDate?: string
  status: 'todo' | 'in_progress' | 'review' | 'done'
  sourceMessageId: string
}

// ─── Initials helper ──────────────────────────────────────────
function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

// ─── Modal Backdrop ───────────────────────────────────────────
function ModalBackdrop({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      aria-hidden="true"
    />
  )
}

// ─── Member Avatar ────────────────────────────────────────────
function MemberAvatar({ member, size = 28 }: { member: MemberOption; size?: number }) {
  const roleColor: Record<string, string> = {
    admin: 'linear-gradient(135deg,#ef4444,#dc2626)',
    leader: 'linear-gradient(135deg,#f59e0b,#d97706)',
    member: 'linear-gradient(135deg,#3b82f6,#6366f1)',
  }
  return (
    <div
      className="member-avatar"
      style={{
        width: size,
        height: size,
        minWidth: size,
        background: member.avatarUrl ? undefined : roleColor[member.role],
        fontSize: size * 0.36,
      }}
      title={member.fullName}
    >
      {member.avatarUrl
        ? <img src={member.avatarUrl} alt={member.fullName} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
        : initials(member.fullName)
      }
    </div>
  )
}

// ─── Convert to Task Modal ────────────────────────────────────
export default function ConvertToTaskModal({
  isOpen,
  onClose,
  messageId,
  messageContent,
  channelId,
  currentUserId,
  currentUserRole,
  members,
  onSuccess,
}: ConvertToTaskModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isPending, startTransition] = useTransition()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  // Pre-fill title từ nội dung tin nhắn
  useEffect(() => {
    if (isOpen) {
      setTitle(messageContent.slice(0, 100))
      setDescription(messageContent)
      setErrors({})
      dialogRef.current?.showModal()
      setTimeout(() => titleRef.current?.focus(), 50)
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen, messageContent])

  // Close on Escape (native <dialog> handles this)
  useEffect(() => {
    const dialog = dialogRef.current
    const handleCancel = (e: Event) => {
      e.preventDefault()
      onClose()
    }
    dialog?.addEventListener('cancel', handleCancel)
    return () => dialog?.removeEventListener('cancel', handleCancel)
  }, [onClose])

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!title.trim()) errs.title = 'Tiêu đề không được để trống'
    if (title.trim().length > 200) errs.title = 'Tiêu đề tối đa 200 ký tự'
    if (!assigneeId) errs.assigneeId = 'Vui lòng chọn người phụ trách'
    if (dueDate) {
      const d = new Date(dueDate)
      if (isNaN(d.getTime())) errs.dueDate = 'Ngày không hợp lệ'
      else if (d < new Date(new Date().setHours(0, 0, 0, 0))) errs.dueDate = 'Hạn chót không được trong quá khứ'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    startTransition(async () => {
      try {
        const res = await fetch('/api/tasks/from-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messageId,
            channelId,
            title: title.trim(),
            description: description.trim() || undefined,
            assigneeId,
            reporterId: currentUserId,
            dueDate: dueDate || undefined,
          }),
        })

        if (!res.ok) {
          const { error } = await res.json()
          setErrors({ submit: error ?? 'Có lỗi xảy ra. Vui lòng thử lại.' })
          return
        }

        const task: CreatedTask = await res.json()
        onSuccess(task)
        onClose()
      } catch {
        setErrors({ submit: 'Mất kết nối. Vui lòng thử lại.' })
      }
    })
  }

  // Chỉ admin và leader mới được dùng
  if (!['admin', 'leader'].includes(currentUserRole)) return null

  return (
    <>
      <style>{`
        /* ── Convert Modal Styles ──────────────────────────── */
        .modal-backdrop {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.6);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          z-index: 49;
          animation: fadeIn 150ms ease both;
        }

        .convert-dialog {
          position: fixed;
          inset: 0;
          margin: auto;
          inline-size: min(520px, 94vw);
          block-size: fit-content;
          max-block-size: 90dvh;
          background: rgba(10,15,40,0.92);
          backdrop-filter: blur(32px);
          -webkit-backdrop-filter: blur(32px);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 20px;
          box-shadow:
            0 32px 80px rgba(0,0,0,0.7),
            0 0 0 1px rgba(255,255,255,0.05),
            inset 0 1px 0 rgba(255,255,255,0.08);
          color: #f0f4ff;
          font-family: 'Inter', system-ui, sans-serif;
          overflow-y: auto;
          z-index: 50;
          padding: 0;
          border-spacing: 0;
          animation: dialogSlideIn 280ms cubic-bezier(0.34,1.56,0.64,1) both;

          /* Remove native dialog styles */
          &::backdrop { display: none; } /* We handle backdrop ourselves */
        }

        @keyframes fadeIn {
          from { opacity: 0; } to { opacity: 1; }
        }
        @keyframes dialogSlideIn {
          from { opacity: 0; transform: translateY(-20px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)      scale(1); }
        }

        .modal-header {
          padding: 20px 24px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          display: flex; align-items: flex-start; gap: 12px;
        }
        .modal-header-icon {
          width: 40px; height: 40px; border-radius: 12px;
          background: linear-gradient(135deg, rgba(59,130,246,0.3), rgba(99,102,241,0.3));
          border: 1px solid rgba(59,130,246,0.4);
          display: grid; place-items: center;
          font-size: 18px; flex-shrink: 0;
        }
        .modal-header-text h2 {
          font-size: 16px; font-weight: 700; letter-spacing: -0.01em;
          background: linear-gradient(135deg,#f0f4ff,#93c5fd);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .modal-header-text p {
          font-size: 12px; color: rgba(240,244,255,0.45); margin-top: 2px;
        }
        .modal-close-btn {
          margin-left: auto; padding: 6px; border-radius: 8px;
          color: rgba(240,244,255,0.4); font-size: 16px; flex-shrink: 0;
          transition: background 120ms, color 120ms;
        }
        .modal-close-btn:hover { background: rgba(255,255,255,0.08); color: #f0f4ff; }

        /* Source message preview */
        .source-preview {
          margin: 0 24px 0;
          padding: 12px;
          background: rgba(59,130,246,0.08);
          border: 1px solid rgba(59,130,246,0.2);
          border-radius: 12px;
          border-left: 3px solid #3b82f6;
          font-size: 13px; color: rgba(240,244,255,0.7);
          line-height: 1.5;
          max-height: 72px; overflow: hidden;
          display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
          margin-top: 16px;
        }
        .source-preview-label {
          font-size: 10px; font-weight: 600; letter-spacing: 0.08em;
          text-transform: uppercase; color: #3b82f6; margin-bottom: 4px;
        }

        .modal-form { padding: 20px 24px 24px; display: flex; flex-direction: column; gap: 18px; }

        /* Form field */
        .form-field { display: flex; flex-direction: column; gap: 6px; }
        .form-label {
          font-size: 12px; font-weight: 600; letter-spacing: 0.05em;
          text-transform: uppercase; color: rgba(240,244,255,0.5);
          display: flex; align-items: center; gap: 6px;
        }
        .form-label-required { color: #ef4444; }

        .form-input {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px;
          padding: 10px 14px;
          color: #f0f4ff;
          font-size: 14px; font-family: inherit;
          transition: border-color 150ms, box-shadow 150ms;
          outline: none; width: 100%;
        }
        .form-input:focus {
          border-color: rgba(99,179,237,0.6);
          box-shadow: 0 0 0 3px rgba(99,179,237,0.12);
        }
        .form-input::placeholder { color: rgba(240,244,255,0.25); }
        .form-input[aria-invalid="true"] { border-color: rgba(239,68,68,0.5); }
        .form-input[type="date"]::-webkit-calendar-picker-indicator {
          filter: invert(0.7); cursor: pointer;
        }

        .form-error {
          font-size: 12px; color: #f87171;
          display: flex; align-items: center; gap: 4px;
        }

        /* Assignee grid */
        .assignee-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 8px; max-height: 200px; overflow-y: auto;
          padding-right: 4px;
        }
        .assignee-option {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 12px; border-radius: 10px;
          border: 1.5px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
          cursor: pointer; transition: all 150ms;
          text-align: left;
        }
        .assignee-option:hover {
          background: rgba(255,255,255,0.07);
          border-color: rgba(255,255,255,0.15);
        }
        .assignee-option[aria-pressed="true"] {
          background: rgba(59,130,246,0.15);
          border-color: rgba(59,130,246,0.5);
          box-shadow: 0 0 12px rgba(59,130,246,0.15);
        }
        .assignee-option__name {
          font-size: 13px; font-weight: 500; color: #f0f4ff;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .assignee-option__role {
          font-size: 10px; color: rgba(240,244,255,0.4); margin-top: 1px;
        }
        .member-avatar {
          border-radius: 50%; display: grid; place-items: center;
          font-weight: 700; color: white; flex-shrink: 0;
          border: 1.5px solid rgba(255,255,255,0.15);
          overflow: hidden;
        }

        /* Role badge */
        .role-badge {
          display: inline-block; font-size: 9px; font-weight: 700;
          letter-spacing: 0.06em; text-transform: uppercase;
          padding: 1px 6px; border-radius: 99px;
        }
        .role-badge--admin { background: rgba(239,68,68,0.2); color: #fca5a5; border: 1px solid rgba(239,68,68,0.3); }
        .role-badge--leader { background: rgba(245,158,11,0.2); color: #fcd34d; border: 1px solid rgba(245,158,11,0.3); }
        .role-badge--member { background: rgba(59,130,246,0.2); color: #93c5fd; border: 1px solid rgba(59,130,246,0.3); }

        /* Submit error */
        .submit-error {
          padding: 10px 14px; border-radius: 10px;
          background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3);
          font-size: 13px; color: #fca5a5;
          display: flex; align-items: center; gap: 8px;
        }

        /* Action buttons */
        .modal-actions { display: flex; gap: 10px; justify-content: flex-end; }
        .btn-cancel {
          padding: 10px 20px; border-radius: 10px; font-size: 14px; font-weight: 500;
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
          color: rgba(240,244,255,0.7);
          transition: background 150ms, color 150ms;
        }
        .btn-cancel:hover { background: rgba(255,255,255,0.1); color: #f0f4ff; }

        .btn-create {
          padding: 10px 24px; border-radius: 10px; font-size: 14px; font-weight: 600;
          background: linear-gradient(135deg, #3b82f6, #6366f1);
          color: white;
          box-shadow: 0 4px 16px rgba(59,130,246,0.35);
          transition: transform 150ms cubic-bezier(0.34,1.56,0.64,1), box-shadow 150ms, opacity 150ms;
          display: flex; align-items: center; gap: 8px;
        }
        .btn-create:hover:not(:disabled) {
          transform: translateY(-1px) scale(1.02);
          box-shadow: 0 8px 24px rgba(59,130,246,0.45);
        }
        .btn-create:active { transform: scale(0.97); }
        .btn-create:disabled { opacity: 0.5; cursor: not-allowed; }

        .spinner {
          width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white; border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {isOpen && <ModalBackdrop onClose={onClose} />}

      <dialog
        ref={dialogRef}
        className="convert-dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-icon" aria-hidden>🎯</div>
          <div className="modal-header-text">
            <h2 id="modal-title">Tạo Thẻ Công Việc</h2>
            <p>Biến tin nhắn thành đầu việc ngay trong chat</p>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Đóng modal">✕</button>
        </div>

        {/* Source message preview */}
        <div style={{ margin: '16px 24px 0' }}>
          <div className="source-preview-label">📨 Tin nhắn gốc</div>
          <div className="source-preview">{messageContent}</div>
        </div>

        {/* Form */}
        <form className="modal-form" onSubmit={handleSubmit} noValidate>

          {/* Title */}
          <div className="form-field">
            <label className="form-label" htmlFor="task-title">
              Tiêu đề <span className="form-label-required" aria-hidden>*</span>
            </label>
            <input
              ref={titleRef}
              id="task-title"
              className="form-input"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Mô tả ngắn gọn đầu việc..."
              maxLength={200}
              aria-required="true"
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? 'title-error' : undefined}
            />
            {errors.title && (
              <span id="title-error" className="form-error" role="alert">
                ⚠ {errors.title}
              </span>
            )}
          </div>

          {/* Description */}
          <div className="form-field">
            <label className="form-label" htmlFor="task-desc">Mô tả chi tiết</label>
            <textarea
              id="task-desc"
              className="form-input"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Thêm chi tiết nếu cần..."
              rows={3}
              style={{ resize: 'vertical', minHeight: 72 }}
            />
          </div>

          {/* Assignee */}
          <div className="form-field">
            <label className="form-label" id="assignee-label">
              Người phụ trách <span className="form-label-required" aria-hidden>*</span>
            </label>
            <div
              className="assignee-grid"
              role="listbox"
              aria-labelledby="assignee-label"
              aria-required="true"
            >
              {members.map(member => (
                <button
                  key={member.id}
                  type="button"
                  className="assignee-option"
                  role="option"
                  aria-selected={assigneeId === member.id}
                  aria-pressed={assigneeId === member.id}
                  onClick={() => setAssigneeId(member.id)}
                >
                  <MemberAvatar member={member} size={32} />
                  <div style={{ overflow: 'hidden' }}>
                    <div className="assignee-option__name">{member.fullName}</div>
                    <span className={`role-badge role-badge--${member.role}`}>
                      {member.role === 'admin' ? 'Admin' : member.role === 'leader' ? 'Leader' : 'Thành viên'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
            {errors.assigneeId && (
              <span className="form-error" role="alert">⚠ {errors.assigneeId}</span>
            )}
          </div>

          {/* Due Date */}
          <div className="form-field">
            <label className="form-label" htmlFor="task-due">
              📅 Hạn chót
            </label>
            <input
              id="task-due"
              className="form-input"
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              aria-invalid={!!errors.dueDate}
              aria-describedby={errors.dueDate ? 'due-error' : undefined}
            />
            {errors.dueDate && (
              <span id="due-error" className="form-error" role="alert">⚠ {errors.dueDate}</span>
            )}
          </div>

          {/* Submit error */}
          {errors.submit && (
            <div className="submit-error" role="alert">
              <span aria-hidden>🚨</span> {errors.submit}
            </div>
          )}

          {/* Actions */}
          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose} disabled={isPending}>
              Huỷ
            </button>
            <button type="submit" className="btn-create" disabled={isPending}>
              {isPending
                ? <><div className="spinner" aria-hidden /><span>Đang tạo...</span></>
                : <><span aria-hidden>🎯</span><span>Tạo Thẻ Công Việc</span></>
              }
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
