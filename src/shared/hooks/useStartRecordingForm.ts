import { useState } from 'react'
import type { RecordingMeta } from '@/features/recorder/hooks/useRecorder'

export function useStartRecordingForm(
  defaultLocation: string,
  onStart: (meta: RecordingMeta) => Promise<void>,
  onStop: () => Promise<void>,
) {
  const [showStartModal, setShowStartModal] = useState(false)
  const [showStopModal, setShowStopModal] = useState(false)
  const [form, setForm] = useState({
    title: '',
    participants: '',
    meetingDate: new Date().toISOString().slice(0, 10),
    location: defaultLocation,
  })

  function openStart() {
    setForm({
      title: '',
      participants: '',
      meetingDate: new Date().toISOString().slice(0, 10),
      location: defaultLocation,
    })
    setShowStartModal(true)
  }

  async function handleStart() {
    setShowStartModal(false)
    await onStart({
      title: form.title.trim(),
      participants: form.participants.trim(),
      meetingDate: form.meetingDate,
      location: form.location.trim() || defaultLocation,
    })
  }

  async function handleStop() {
    setShowStopModal(false)
    await onStop()
  }

  return {
    form,
    setForm,
    showStartModal,
    setShowStartModal,
    showStopModal,
    setShowStopModal,
    openStart,
    handleStart,
    handleStop,
  }
}
