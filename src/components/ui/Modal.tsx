import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CareerBackdrop } from './CareerBackdrop'
import '@/styles/Modal.css'
import { store } from '@/lib/store'
import { modalStack, notifyModalStack, startParticleAnimation } from '@/lib/particle-animation'
const subscribeEffects = (listener: () => void) => store.onChange('dynamicEffects', listener)
const getEffects = () => store.get('dynamicEffects')

/** 退场动画 0.2s，略留余量后强制卸载，避免 animationend 不触发时卡死 */
const CLOSE_ANIMATION_FALLBACK_MS = 400
let initialBodyOverflow = ''

export interface ModalProps {
  /** 是否显示 */
  open: boolean
  /** 关闭回调 */
  onClose: () => void
  /** 内容 */
  children: ReactNode
  /** 宽度，默认 680px */
  width?: number | string
  /** 高度，默认 520px */
  height?: number | string
  /** 点击遮罩是否关闭，默认 true */
  maskClosable?: boolean
  /** 是否显示关闭按钮，默认 true */
  closable?: boolean
  careerBackground?: boolean
}

export function Modal({
  open,
  onClose,
  children,
  width = 680,
  height = 520,
  maskClosable = true,
  closable = true,
  careerBackground = false,
}: ModalProps) {
  const dynamicEffects = useSyncExternalStore(subscribeEffects, getEffects)
  const dialogRef = useRef<HTMLDivElement>(null)
  const modalId = useRef(Symbol('sona-modal'))
  const overlayRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const mouseDownOnOverlayRef = useRef(false)
  const lastCloseAtRef = useRef(0)
  const [mounted, setMounted] = useState(open)

  const activeMounted = open || mounted
  const activeClosing = !open && mounted

  // 控制挂载/卸载：open 为 true 时首帧直接挂载，关闭时等动画结束再卸载
  useEffect(() => {
    if (open && !mounted) {
      setMounted(true)
    }
  }, [open, mounted])

  // 监听退出动画结束后真正卸载
  useEffect(() => {
    if (!activeClosing) return
    const overlay = overlayRef.current
    const finish = () => {
      setMounted(false)
    }
    if (!overlay) {
      finish()
      return
    }
    const onEnd = (e: AnimationEvent) => {
      if (e.target === overlay) finish()
    }
    overlay.addEventListener('animationend', onEnd)
    // 兜底：动画没播（被客户端样式覆盖、reduced-motion、标签页不可见等）时
    // animationend 永远不会来，弹窗会一直停在屏幕上关不掉
    const fallbackTimer = window.setTimeout(finish, CLOSE_ANIMATION_FALLBACK_MS)
    return () => {
      overlay.removeEventListener('animationend', onEnd)
      window.clearTimeout(fallbackTimer)
    }
  }, [activeClosing])

  /** 统一的关闭入口：同一次点击可能从多条路径进来，用时间窗去重 */
  const requestClose = useCallback(() => {
    const now = Date.now()
    if (now - lastCloseAtRef.current < 300) return
    lastCloseAtRef.current = now
    onClose()
  }, [onClose])

  // 关闭按钮：除 React 的 onClick 外，再挂一层原生捕获监听
  //
  // 客户端（尤其是"游戏中"界面）会在自己的层上处理点击，合成事件链路一旦被打断，
  // 只绑 onClick 的关闭按钮就会完全点不动。pointerdown 比 click 更早、更难被吞掉，
  // 两条路任意一条通就能关掉。
  useEffect(() => {
    const btn = closeBtnRef.current
    if (!btn) return

    const handleNative = (e: Event) => {
      e.stopPropagation()
      requestClose()
    }

    btn.addEventListener('pointerdown', handleNative, true)
    btn.addEventListener('click', handleNative, true)
    return () => {
      btn.removeEventListener('pointerdown', handleNative, true)
      btn.removeEventListener('click', handleNative, true)
    }
  }, [requestClose, activeMounted, closable])

  // ESC 关闭
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalStack[modalStack.length - 1] === modalId.current) requestClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, requestClose])

  useEffect(() => {
    if (!activeMounted || activeClosing || !dynamicEffects || !canvasRef.current) return
    return startParticleAnimation(canvasRef.current, 80, () => modalStack[modalStack.length - 1] === modalId.current)
  }, [activeMounted, activeClosing, dynamicEffects])

  // 打开时阻止背景滚动
  useEffect(() => {
    if (!open || !activeMounted || activeClosing) return
    const id = modalId.current
    if (!modalStack.length) initialBodyOverflow = document.body.style.overflow
    modalStack.push(id)
    notifyModalStack()
    document.body.style.overflow = 'hidden'
    return () => {
      const index = modalStack.lastIndexOf(id)
      if (index !== -1) modalStack.splice(index, 1)
      notifyModalStack()
      if (!modalStack.length) document.body.style.overflow = initialBodyOverflow
    }
  }, [open, activeMounted, activeClosing])

  if (!activeMounted) return null

  const style = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  }

  const overlayClass = `sona-modal-overlay${activeClosing ? ' sona-modal-closing' : ''}`
  const dialogClass = `sona-modal-dialog${careerBackground ? ' sona-modal-dialog--career' : ''}${activeClosing ? ' sona-modal-closing' : ''}`

  const handleOverlayMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    mouseDownOnOverlayRef.current = e.target === e.currentTarget
    e.stopPropagation()
  }

  const handleOverlayMouseUp = (e: MouseEvent<HTMLDivElement>) => {
    const shouldClose = maskClosable
      && mouseDownOnOverlayRef.current
      && e.target === e.currentTarget

    mouseDownOnOverlayRef.current = false
    e.stopPropagation()

    if (shouldClose) requestClose()
  }

  return createPortal(
    <div
      ref={overlayRef}
      className={overlayClass}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={handleOverlayMouseDown}
      onMouseUp={handleOverlayMouseUp}
    >
      <div
        ref={dialogRef}
        className={dialogClass}
        style={style}
        onClick={(e) => e.stopPropagation()}
      >
        {careerBackground && <CareerBackdrop active={open && !activeClosing} />}
        {/* Canvas 粒子背景 */}
        <canvas
          ref={canvasRef}
          className="sona-modal-particle-canvas"
        />
        {/* 关闭按钮（悬浮右上角） */}
        {closable && (
          <button ref={closeBtnRef} className="sona-modal-close" onClick={requestClose} title="Close">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}
        {/* Body */}
        <div className="sona-modal-body">
          {children}
        </div>
      </div>
    </div>,
    // 挂到 body，避免 #sona-root 的低层级 stacking context 被客户端透明层盖住，
    // 出现弹窗可见但关闭按钮无法接收点击的情况。
    document.body,
  )
}
