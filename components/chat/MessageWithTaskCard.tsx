'use client'

/**
 * MessageWithTaskCard.tsx
 * Wrapper bọc quanh từng tin nhắn trong ChatWindow.
 * Tích hợp: ConvertToTaskModal + TaskCard + BubbleActions
 *
 * Luồng hoạt động:
 *  1. Hover lên bubble → hiện nút "🎯 Tạo task"
 *  2. Click → mở ConvertToTaskModal (glassmorphism dialog)
 *  3. Submit → gọi POST /api/tasks/from-message
 *  4. Success → render TaskCard thay thế/bổ sung vào bubble
 *  5. TaskCard → inline status update qua PATCH /api/tasks/:id/status
 */

import { useState, useCallback } from 'react'
import ConvertToTaskModal, { type CreatedTask, type MemberOption } from './ConvertToTaskModal'
import TaskCard from './TaskCard'

// ─── Types ────────────────────────────────────────────────────
interface MessageSender {
  id: string
  fullName: string
  avatarUrl?: string
}

export interface MessageData {
  id: string
  content: string
  senderId: string
  channelId: string
  parentId?: string | null
  isTaskCard: boolean
  createdAt: string
  editedAt?: string | null
  sender: MessageSender
  replyCount?: number
  readStatus?: { userId: string; readAt: string }[]
  task?: CreatedTask | null   // preloaded task nếu isTaskCard = true
}

interface MessageWithTaskCardProps {
  message: MessageData
  currentUserId: string
  currentUserRole: 'admin' | 'leader' | 'member'
  members: MemberOption[]
  totalMembers: number
  onReply: (msg: MessageData) => void
}

// ─── Helpers ──────────────────────────────────────────────────
function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

// ─── Read Receipts badge ──────────────────────────────────────
function ReadBadge({ count, total }: { count: number; total: number }) {
  if (count === 0) return null
  return (
    <span
      style={{
        fontSize: 10,
        color: count >= total * 0.8 ? '#10b981' : 'rgba(240,244,255,0.35)',
        display: 'flex', alignItems: 'center', gap: 2,
      }}
      title={`${count}/${total} thành viên đã xem`}
      aria-label={`Đã xem ${count} trên ${total} thành viên`}
    >
      ✓✓ {count}/{total}
    </span>
  )
}

// ─── Bubble Action Toolbar ────────────────────────────────────
function BubbleToolbar({
  canConvert,
  isTaskCard,
  onConvert,
  onReply,
}: {
  canConvert: boolean
  isTaskCard: boolean
  onConvert: () => void
  onReply: () => void
}) {
  return (
    <div
      className="msg-bubble-toolbar"
      role="toolbar"
      aria-label="Thao tác tin nhắn"
    >
      <button
        className="bubble-tool-btn"
        onClick={onReply}
        title="Trả lời trong luồng"
        aria-label="Mở luồng trả lời"
      >
        💬
      </button>
      {canConvert && !isTaskCard && (
        <button
          className="bubble-tool-btn bubble-tool-btn--highlight"
          onClick={onConvert}
          title="Tạo thẻ công việc từ tin nhắn này"
          aria-label="Biến tin nhắn thành thẻ công việc"
        >
          🎯
        </button>
      )}
      <button className="bubble-tool-btn" title="Thêm reaction" aria-label="Thêm phản hồi cảm xúc">
        😊
      </button>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────
export default function MessageWithTaskCard({
  message,
  currentUserId,
  currentUserRole,
  members,
  totalMembers,
  onReply,
}: MessageWithTaskCardProps) {
  const isOwn = message.senderId === currentUserId
  const canConvert = ['admin', 'leader'].includes(currentUserRole)

  const [modalOpen, setModalOpen] = useState(false)
  const [taskData, setTaskData] = useState<CreatedTask | null>(message.task ?? null)
  const [isTaskCard, setIsTaskCard] = useState(message.isTaskCard)

  const handleConvertSuccess = useCallback((task: CreatedTask) => {
    setTaskData(task)
    setIsTaskCard(true)
  }, [])

  const readCount = message.readStatus?.length ?? 0

  return (
    <>
      <style>{`
        /* ── Message with Task Card styles ──────────────────── */
        .msg-wrapper {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-inline-size: min(580px, 85%);
          animation: msgAppear 300ms cubic-bezier(0.34,1.56,0.64,1) both;
        }

        @keyframes msgAppear {
          from { opacity: 0; transform: translateY(10px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)     scale(1); }
        }

        .msg-wrapper--own { margin-inline-start: auto; align-items: flex-end; }
        .msg-wrapper--other { margin-inline-end: auto; align-items: flex-start; }

        /* Avatar + content row */
        .msg-row {
          display: flex;
          gap: 10px;
          align-items: flex-end;
          position: relative;
        }
        .msg-wrapper--own .msg-row { flex-direction: row-reverse; }

        /* Avatar */
        .msg-avatar {
          width: 34px; height: 34px; border-radius: 50%;
          display: grid; place-items: center;
          font-size: 11px; font-weight: 700; color: white;
          flex-shrink: 0;
          border: 1.5px solid rgba(255,255,255,0.15);
          overflow: hidden;
          align-self: flex-end;
        }

        /* Bubble container (relative for toolbar) */
        .bubble-container {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        /* Sender name */
        .msg-sender-name {
          font-size: 11px; font-weight: 600;
          color: rgba(240,244,255,0.45);
          padding-inline: 4px;
        }
        .msg-wrapper--own .msg-sender-name { text-align: right; }

        /* Bubble */
        .msg-bubble {
          padding: 10px 14px;
          border-radius: 16px;
          font-size: 14px; line-height: 1.55;
          word-break: break-word;
          position: relative;
        }

        .msg-bubble--own {
          background: rgba(59,130,246,0.18);
          backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(59,130,246,0.35);
          border-end-end-radius: 4px;
          color: #f0f4ff;
        }

        .msg-bubble--other {
          background: rgba(255,255,255,0.07);
          backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.13);
          border-end-start-radius: 4px;
          color: #f0f4ff;
        }

        /* Task card marker on bubble */
        .msg-bubble--converted {
          border-color: rgba(245,158,11,0.4) !important;
          background: rgba(245,158,11,0.06) !important;
        }

        .task-origin-badge {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 10px; font-weight: 700; letter-spacing: 0.05em;
          text-transform: uppercase;
          color: #fbbf24;
          background: rgba(245,158,11,0.12);
          border: 1px solid rgba(245,158,11,0.25);
          border-radius: 99px;
          padding: 2px 8px;
          margin-block-end: 6px;
          display: block; width: fit-content;
        }

        /* Timestamp + read */
        .msg-meta-row {
          display: flex; align-items: center; gap: 6px;
          padding-inline: 4px;
          font-size: 10px; color: rgba(240,244,255,0.3);
        }
        .msg-wrapper--own .msg-meta-row { justify-content: flex-end; }

        /* Hover toolbar */
        .msg-bubble-toolbar {
          position: absolute;
          top: -32px;
          display: flex;
          gap: 2px;
          background: rgba(8,12,32,0.92);
          backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px;
          padding: 4px;
          opacity: 0;
          pointer-events: none;
          transform: translateY(4px);
          transition: opacity 120ms ease, transform 120ms ease;
          z-index: 10;
          white-space: nowrap;
        }

        /* Own messages: align toolbar to right */
        .msg-wrapper--own .msg-bubble-toolbar { right: 0; }
        .msg-wrapper--other .msg-bubble-toolbar { left: 0; }

        /* Show on hover of bubble-container */
        .bubble-container:hover .msg-bubble-toolbar {
          opacity: 1;
          pointer-events: auto;
          transform: translateY(0);
        }

        .bubble-tool-btn {
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 14px;
          color: rgba(240,244,255,0.6);
          transition: background 100ms, color 100ms, transform 100ms;
        }
        .bubble-tool-btn:hover {
          background: rgba(255,255,255,0.1);
          color: #f0f4ff;
          transform: scale(1.1);
        }
        .bubble-tool-btn--highlight:hover {
          background: rgba(245,158,11,0.2);
          color: #fbbf24;
        }

        /* Reply count */
        .reply-count-btn {
          font-size: 11px; color: #60a5fa;
          display: flex; align-items: center; gap: 4px;
          padding: 2px 6px; border-radius: 6px;
          transition: background 100ms;
          width: fit-content;
        }
        .reply-count-btn:hover { background: rgba(59,130,246,0.1); }

        /* Thread connector line */
        .thread-connector {
          width: 2px;
          background: linear-gradient(to bottom, rgba(59,130,246,0.4), transparent);
          border-radius: 99px;
          margin-inline-start: 16px;
          min-height: 12px;
        }
      `}</style>

      <div
        className={`msg-wrapper ${isOwn ? 'msg-wrapper--own' : 'msg-wrapper--other'}`}
        data-message-id={message.id}
      >
        <div className="msg-row">
          {/* Avatar (only for others) */}
          {!isOwn && (
            <div
              className="msg-avatar"
              style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}
              aria-label={message.sender.fullName}
              title={message.sender.fullName}
            >
              {message.sender.avatarUrl
                ? <img src={message.sender.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : initials(message.sender.fullName)
              }
            </div>
          )}

          {/* Bubble + Toolbar */}
          <div className="bubble-container">
            {/* Sender name (for others) */}
            {!isOwn && (
              <div className="msg-sender-name">{message.sender.fullName}</div>
            )}

            {/* Toolbar (hover reveal) */}
            <BubbleToolbar
              canConvert={canConvert}
              isTaskCard={isTaskCard}
              onConvert={() => setModalOpen(true)}
              onReply={() => onReply(message)}
            />

            {/* Text bubble */}
            <div className={`msg-bubble ${isOwn ? 'msg-bubble--own' : 'msg-bubble--other'} ${isTaskCard ? 'msg-bubble--converted' : ''}`}>
              {isTaskCard && (
                <span className="task-origin-badge" aria-label="Tin nhắn đã được tạo thành thẻ công việc">
                  🎯 Đã tạo thẻ công việc
                </span>
              )}
              <p>{message.content}</p>
            </div>

            {/* Timestamp + read receipts */}
            <div className="msg-meta-row">
              <time dateTime={message.createdAt}>
                {formatTime(message.createdAt)}
                {message.editedAt && ' · đã sửa'}
              </time>
              {isOwn && (
                <ReadBadge count={readCount} total={totalMembers} />
              )}
            </div>

            {/* Reply thread indicator */}
            {(message.replyCount ?? 0) > 0 && (
              <>
                <div className="thread-connector" aria-hidden />
                <button
                  className="reply-count-btn"
                  onClick={() => onReply(message)}
                  aria-label={`Xem ${message.replyCount} phản hồi trong luồng`}
                >
                  <span aria-hidden>💬</span>
                  {message.replyCount} phản hồi
                </button>
              </>
            )}
          </div>
        </div>

        {/* Task Card (rendered below bubble if converted) */}
        {isTaskCard && taskData && (
          <div
            style={{
              marginInlineStart: isOwn ? 0 : 44, // align with bubble (skip avatar width)
              marginInlineEnd: isOwn ? 0 : 0,
              animation: 'msgAppear 400ms cubic-bezier(0.34,1.56,0.64,1) both',
            }}
          >
            <TaskCard
              task={taskData}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
            />
          </div>
        )}
      </div>

      {/* Convert to Task Modal */}
      <ConvertToTaskModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        messageId={message.id}
        messageContent={message.content}
        channelId={message.channelId}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        members={members}
        onSuccess={handleConvertSuccess}
      />
    </>
  )
}
