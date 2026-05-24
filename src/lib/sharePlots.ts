/**
 * Utilities for sharing plots to social media platforms (Facebook and Instagram).
 * Posts link back to the GitHub Pages site.
 */

const GITHUB_PAGES_URL = 'https://samsta.github.io/KeyBpmMap/'

export interface SharePlotOptions {
  chartName: string
  chartDescription: string
  svgElement: SVGSVGElement
}

/**
 * Generates a share message that includes the app URL
 */
export function generateShareMessage(options: Omit<SharePlotOptions, 'svgElement'>): string {
  return `Check out my music library analysis using KeyBpmMap! ${options.chartDescription}\n\n${GITHUB_PAGES_URL}`
}

/**
 * Converts SVG element to PNG blob for sharing
 */
export async function svgToPngBlob(svgElement: SVGSVGElement): Promise<Blob> {
  const clonedSvg = svgElement.cloneNode(true) as SVGSVGElement
  const serializer = new XMLSerializer()
  const source = serializer.serializeToString(clonedSvg)
  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  try {
    const image = await loadImage(url)
    const viewBox = svgElement.viewBox.baseVal
    const width = viewBox.width || svgElement.clientWidth || 1200
    const height = viewBox.height || svgElement.clientHeight || 800
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('Could not create a canvas rendering context.')
    }

    context.fillStyle = '#080b14'
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (pngBlob) => {
          if (pngBlob) {
            resolve(pngBlob)
          } else {
            reject(new Error('Failed to convert canvas to blob'))
          }
        },
        'image/png',
      )
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to render the SVG export.'))
    image.src = src
  })
}

/**
 * Shares content to social media using the Web Share API if available,
 * with fallback to showing a share dialog
 */
export async function sharePlot(
  platform: 'facebook' | 'instagram',
  options: SharePlotOptions,
): Promise<void> {
  const message = generateShareMessage(options)

  try {
    const pngBlob = await svgToPngBlob(options.svgElement)

    // Try using the Web Share API (available on mobile browsers and some desktop browsers)
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        const file = new File([pngBlob], `keybpmmap-${platform}.png`, {
          type: 'image/png',
        })
        await navigator.share({
          title: 'KeyBpmMap - ' + options.chartName,
          text: message,
          files: [file],
        })
        return
      } catch (error) {
        // User cancelled or share failed; fall back to showing share dialog
        if (error instanceof Error && error.name === 'AbortError') {
          return // User cancelled, don't show error
        }
        console.log('Web Share API failed, falling back to share dialog', error)
      }
    }

    // Fallback: Show share dialog with instructions
    showShareDialog(platform, options, message, pngBlob)
  } catch (error) {
    console.error('Failed to prepare chart for sharing:', error)
    showShareDialog(platform, options, message, null)
  }
}

/**
 * Shows a dialog with sharing instructions and the chart image
 */
function showShareDialog(
  platform: 'facebook' | 'instagram',
  _options: SharePlotOptions,
  message: string,
  pngBlob: Blob | null,
): void {
  const dialog = document.createElement('div')
  dialog.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `

  const content = document.createElement('div')
  content.style.cssText = `
    background: #1a1d2e;
    border-radius: 12px;
    padding: 32px;
    max-width: 500px;
    max-height: 80vh;
    overflow-y: auto;
    color: #fff;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  `

  const title = document.createElement('h2')
  title.textContent = `Share to ${platform === 'facebook' ? 'Facebook' : 'Instagram'}`
  title.style.cssText = 'margin: 0 0 16px 0; font-size: 20px; font-weight: 600;'

  const description = document.createElement('p')
  description.style.cssText = 'margin: 0 0 16px 0; color: #ccc; font-size: 14px; line-height: 1.5;'

  if (platform === 'facebook') {
    description.innerHTML = `
      <strong>To share on Facebook:</strong><br>
      1. Download the chart image below<br>
      2. Go to <a href="https://www.facebook.com" target="_blank" style="color: #4267B2; text-decoration: none;">Facebook.com</a><br>
      3. Create a new post and upload the image<br>
      4. Add this caption:<br>
      <code style="display: block; background: #0a0d14; padding: 8px; margin: 8px 0; border-radius: 4px; font-size: 12px; overflow-x: auto; word-break: break-word;">${escapeHtml(message)}</code>
    `
  } else {
    description.innerHTML = `
      <strong>To share on Instagram:</strong><br>
      1. Download the chart image below<br>
      2. Open the <a href="https://www.instagram.com" target="_blank" style="color: #E4405F; text-decoration: none;">Instagram app</a> on your phone<br>
      3. Create a new post and upload the image<br>
      4. Add this caption:<br>
      <code style="display: block; background: #0a0d14; padding: 8px; margin: 8px 0; border-radius: 4px; font-size: 12px; overflow-x: auto; word-break: break-word;">${escapeHtml(message)}</code>
    `
  }

  const preview = document.createElement('div')
  preview.style.cssText = `
    margin: 16px 0;
    padding: 12px;
    background: #0a0d14;
    border-radius: 8px;
    text-align: center;
  `

  if (pngBlob) {
    const img = document.createElement('img')
    img.src = URL.createObjectURL(pngBlob)
    img.style.cssText = 'max-width: 100%; max-height: 300px; border-radius: 4px;'
    preview.appendChild(img)
  } else {
    const placeholder = document.createElement('p')
    placeholder.textContent = 'Chart preview unavailable'
    placeholder.style.cssText = 'color: #999; margin: 0;'
    preview.appendChild(placeholder)
  }

  const buttonContainer = document.createElement('div')
  buttonContainer.style.cssText = 'display: flex; gap: 12px; margin-top: 24px;'

  const downloadBtn = document.createElement('button')
  downloadBtn.textContent = 'Download Chart'
  downloadBtn.style.cssText = `
    flex: 1;
    padding: 10px 16px;
    background: ${platform === 'facebook' ? '#4267B2' : '#E4405F'};
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s;
  `
  downloadBtn.onmouseover = () => (downloadBtn.style.opacity = '0.8')
  downloadBtn.onmouseout = () => (downloadBtn.style.opacity = '1')
  downloadBtn.onclick = () => {
    if (pngBlob) {
      const url = URL.createObjectURL(pngBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = `keybpmmap-${platform}.png`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  const closeBtn = document.createElement('button')
  closeBtn.textContent = 'Close'
  closeBtn.style.cssText = `
    flex: 1;
    padding: 10px 16px;
    background: #333;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s;
  `
  closeBtn.onmouseover = () => (closeBtn.style.opacity = '0.8')
  closeBtn.onmouseout = () => (closeBtn.style.opacity = '1')
  closeBtn.onclick = () => {
    dialog.remove()
  }

  buttonContainer.appendChild(downloadBtn)
  buttonContainer.appendChild(closeBtn)

  content.appendChild(title)
  content.appendChild(description)
  content.appendChild(preview)
  content.appendChild(buttonContainer)
  dialog.appendChild(content)

  dialog.onclick = (e) => {
    if (e.target === dialog) {
      dialog.remove()
    }
  }

  document.body.appendChild(dialog)
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, (m) => map[m])
}
