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
 * Creates a Facebook share URL (without requiring an app ID)
 * Uses the standard share endpoint which works for any website
 */
export function createFacebookShareUrl(options: SharePlotOptions): string {
  const params = new URLSearchParams({
    u: GITHUB_PAGES_URL,
    quote: `${options.chartName}: ${options.chartDescription}`,
  })
  return `https://www.facebook.com/sharer/sharer.php?${params.toString()}`
}

/**
 * Creates an Instagram share URL
 * Note: Instagram does not provide a direct web-based share API.
 * This function opens Instagram.com; users can manually share via their mobile app
 * or use the clipboard-based sharing approach.
 */
export function createInstagramShareUrl(): string {
  return 'https://www.instagram.com/'
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
  if (platform === 'facebook') {
    const facebookUrl = createFacebookShareUrl(options)
    window.open(facebookUrl, '_blank', 'width=600,height=600')
  } else {
    // Instagram fallback: Copy message to clipboard and open Instagram
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(message)
        console.log(
          'Message copied to clipboard! Open Instagram and paste it in your post caption.',
        )
        // Open Instagram in a new window
        window.open(createInstagramShareUrl(), '_blank')
      } catch (err) {
        console.warn('Failed to copy to clipboard:', err)
        window.open(createInstagramShareUrl(), '_blank')
      }
    } else {
      console.log(
        'Please copy this message and share it on Instagram:',
        message,
      )
      window.open(createInstagramShareUrl(), '_blank')
    }
  }
}

/**
 * Checks if the browser supports the Web Share API
 * Useful for conditionally showing share buttons or adjusting UI
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
  return `Share to ${platform === 'facebook' ? 'Facebook' : 'Instagram'} (opens in new window)`
}

