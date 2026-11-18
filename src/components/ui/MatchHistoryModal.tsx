import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react'
import { Modal } from './Modal'
import type { PlayerHistoryModalProps } from './PlayerHistoryModal'

let ResolvedPlayerHistoryModal: ComponentType<PlayerHistoryModalProps> | null = null
let preloadPromise: Promise<{ default: ComponentType<PlayerHistoryModalProps> }> | null = null

export function preloadMatchHistoryModal(): Promise<{ default: ComponentType<PlayerHistoryModalProps> }> {
  if (!preloadPromise) {
    preloadPromise = import('./PlayerHistoryModal')
      .then((m) => {
        ResolvedPlayerHistoryModal = m.PlayerHistoryModal
        return { default: m.PlayerHistoryModal }
      })
      .catch((err) => {
        preloadPromise = null
        throw err
      })
  }
  return preloadPromise
}

const LazyPlayerHistoryModal = lazy(preloadMatchHistoryModal)

export type { PlayerHistoryModalProps as MatchHistoryModalProps }

export function MatchHistoryModal(props: PlayerHistoryModalProps) {
  const [activated, setActivated] = useState(props.open)

  useEffect(() => {
    if (props.open) setActivated(true)
  }, [props.open])

  if (!activated && !props.open) return null

  if (ResolvedPlayerHistoryModal) {
    return <ResolvedPlayerHistoryModal {...props} />
  }

  return (
    <Suspense
      fallback={
        props.open ? (
          <Modal open onClose={props.onClose} careerBackground width="min(1320px, 95vw)" height="min(940px, 92vh)">
            <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#c8aa6e', fontSize: 13 }}>
              正在打开详细战绩…
            </div>
          </Modal>
        ) : null
      }
    >
      <LazyPlayerHistoryModal {...props} />
    </Suspense>
  )
}
