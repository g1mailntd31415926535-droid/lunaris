// A quiet, user-gesture-only UI chime. No media autoplay or gameplay audio engine.
let context: AudioContext | null = null

export function playUiTone(kind: 'click' | 'success' | 'warning' = 'click') {
  try {
    context ??= new AudioContext()
    void context.resume()
    const now = context.currentTime
    const notes = kind === 'success' ? [523.25, 659.25, 783.99] : kind === 'warning' ? [329.63, 293.66] : [622.25]
    notes.forEach((frequency, index) => {
      const oscillator = context!.createOscillator()
      const gain = context!.createGain()
      const start = now + index * 0.075
      oscillator.type = 'sine'; oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.035, start + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14)
      oscillator.connect(gain); gain.connect(context!.destination)
      oscillator.start(start); oscillator.stop(start + 0.16)
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
    })
  } catch { /* Audio is an optional enhancement; the visible feedback still works. */ }
}
