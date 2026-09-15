// Derived from the preload bridge so the renderer cannot drift from what is exposed.
import type { KafdeckApi } from '../electron/preload'

declare global {
  interface Window {
    kafdeck: KafdeckApi
  }
}

export {}
