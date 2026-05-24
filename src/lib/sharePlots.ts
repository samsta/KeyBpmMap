/**
 * Utilities for sharing plots to social media platforms (Facebook and Instagram).
 * Posts link back to the GitHub Pages site.
 */

const GITHUB_PAGES_URL = 'https://samsta.github.io/KeyBpmMap/'

export interface SharePlotOptions {
  chartName: string
  chartDescription: string
}

/**
 * Generates a share message that includes the app URL
 */
export function generateShareMessage(options: SharePlotOptions): string {
  return `Check out my music library analysis using KeyBpmMap! ${options.chartDescription}\n\n${GITHUB_PAGES_URL}`
}

/**
 * Creates a Facebook share URL
 */
export function createFacebookShareUrl(options: SharePlotOptions): string {
  const message = generateShareMessage(options)
  const params = new URLSearchParams({
    app_id: '12345', // Note: This is a placeholder; Facebook requires a real app ID
    display: 'popup',
    href: GITHUB_PAGES_URL,
    quote: message,
  })
  return `https://www.facebook.com/dialog/share?${params.toString()}`
}

/**
 * Creates an Instagram share URL
 * Note: Instagram doesn't have direct web share functionality due to platform policies.
 * This provides a fallback that opens Instagram with the share message copied to clipboard.
 */
export function createInstagramShareUrl(options: SharePlotOptions): string {
  const message = generateShareMessage(options)
  const params = new URLSearchParams({
    text: message,
  })
  return `https://www.instagram.com/?${params.toString()}`
}

/**
 * Shares content to social media using the Web Share API if available,
 * with fallback to direct links
 */
export async function sharePlot(
  platform: 'facebook' | 'instagram',
  options: SharePlotOptions,
): Promise<void> {
  const message = generateShareMessage(options)

  // Try using the Web Share API (available on mobile browsers and some desktop browsers)
  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    try {
      await navigator.share({
        title: 'KeyBpmMap - ' + options.chartName,
        text: message,
        url: GITHUB_PAGES_URL,
      })
      return
    } catch (error) {
      // User cancelled or share failed; fall back to platform-specific URLs
      if (error instanceof Error && error.name === 'AbortError') {
        return // User cancelled, don't show error
      }
      console.log('Web Share API failed, falling back to platform URLs', error)
    }
  }

  // Fallback: Open platform-specific share URLs
  const url =
    platform === 'facebook'
      ? createFacebookShareUrl(options)
      : createInstagramShareUrl(options)

  // Copy message to clipboard for Instagram (since it doesn't have direct share links)
  if (platform === 'instagram' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(message)
      alert('Message copied to clipboard! Open Instagram and paste it in your post.')
    } catch (err) {
      console.warn('Failed to copy to clipboard:', err)
    }
  }

  // Open the platform URL in a new window
  window.open(url, '_blank', 'width=600,height=600')
}

/**
 * Checks if the browser supports social sharing
 */
export function canShare(): boolean {
  return typeof navigator !== 'undefined' && 'share' in navigator
}

/**
 * Gets the appropriate share button label based on platform and available features
 */
export function getShareButtonLabel(platform: 'facebook' | 'instagram'): string {
  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    return `Share to ${platform === 'facebook' ? 'Facebook' : 'Instagram'}`
  }
  return `Share to ${platform === 'facebook' ? 'Facebook' : 'Instagram'} (new window)`
}
