import { useLayoutEffect } from 'react'
import type { RefObject } from 'react'

/** Reserve the real footer height for mobile drawers. The footer does not use
 * this variable itself, so the observer cannot create a layout feedback loop. */
export function useHudBounds(root: RefObject<HTMLElement | null>, footer: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const container = root.current, dock = footer.current
    if (!container || !dock) return
    let previous = -1
    const update = () => {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight
      const reserve = Math.max(0, Math.ceil(viewportHeight - dock.getBoundingClientRect().top + 12))
      if (reserve !== previous) { previous = reserve; container.style.setProperty('--footer-reserve', `${reserve}px`) }
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(dock)
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
    return () => { observer.disconnect(); window.removeEventListener('resize', update); window.visualViewport?.removeEventListener('resize', update) }
  }, [root, footer])
}
