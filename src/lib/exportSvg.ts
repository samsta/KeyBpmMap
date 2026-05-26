import { jsPDF } from 'jspdf'
import 'svg2pdf.js'

export async function downloadSvgAsPng(
  svgElement: SVGSVGElement,
  fileName: string,
): Promise<void> {
  const { canvas, url } = await renderSvgToCanvas(svgElement)

  try {
    const downloadUrl = canvas.toDataURL('image/png')
    triggerDownload(downloadUrl, fileName)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function downloadSvgAsPdf(
  svgElement: SVGSVGElement,
  fileName: string,
): Promise<void> {
  const { clonedSvg, width, height } = cloneSvgForExport(svgElement)
  let downloadUrl: string | null = null

  try {
    const pdf = new jsPDF({
      compress: true,
      format: [width, height],
      orientation: width > height ? 'landscape' : 'portrait',
      unit: 'pt',
    })

    await pdf.svg(clonedSvg, { height, width, x: 0, y: 0 })

    const pdfBuffer = pdf.output('arraybuffer')
    const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' })
    downloadUrl = URL.createObjectURL(pdfBlob)
    triggerDownload(downloadUrl, fileName)
  } finally {
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl)
    }
  }
}

async function renderSvgToCanvas(
  svgElement: SVGSVGElement,
): Promise<{ canvas: HTMLCanvasElement; url: string }> {
  const { clonedSvg, height, width } = cloneSvgForExport(svgElement)
  const serializer = new XMLSerializer()
  const source = serializer.serializeToString(clonedSvg)
  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const image = await loadImage(url)
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

    return { canvas, url }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

function cloneSvgForExport(
  svgElement: SVGSVGElement,
): { clonedSvg: SVGSVGElement; height: number; width: number } {
  const clonedSvg = svgElement.cloneNode(true) as SVGSVGElement
  const { height, width } = getSvgExportDimensions(svgElement)

  clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clonedSvg.setAttribute('width', width.toString())
  clonedSvg.setAttribute('height', height.toString())
  inlineTextStyles(svgElement, clonedSvg)

  return { clonedSvg, height, width }
}

function getSvgExportDimensions(svgElement: SVGSVGElement): { height: number; width: number } {
  const viewBox = svgElement.viewBox.baseVal
  const width = Math.max(1, Math.round(viewBox.width || svgElement.clientWidth || 1200))
  const height = Math.max(1, Math.round(viewBox.height || svgElement.clientHeight || 800))

  return { height, width }
}

function inlineTextStyles(sourceSvg: SVGSVGElement, targetSvg: SVGSVGElement): void {
  const sourceTextNodes = sourceSvg.querySelectorAll('text')
  const targetTextNodes = targetSvg.querySelectorAll('text')
  if (sourceTextNodes.length !== targetTextNodes.length) {
    console.warn('SVG export text node mismatch.', {
      sourceCount: sourceTextNodes.length,
      targetCount: targetTextNodes.length,
    })
  }
  const pairCount = Math.min(sourceTextNodes.length, targetTextNodes.length)

  for (let textNodeIndex = 0; textNodeIndex < pairCount; textNodeIndex += 1) {
    const sourceTextNode = sourceTextNodes[textNodeIndex]
    const targetTextNode = targetTextNodes[textNodeIndex]
    const computedStyle = getComputedStyle(sourceTextNode)
    setAttributeIfValue(targetTextNode, 'fill', computedStyle.fill)
    setAttributeIfValue(targetTextNode, 'font-family', computedStyle.fontFamily)
    setAttributeIfValue(targetTextNode, 'font-size', computedStyle.fontSize)
    setAttributeIfValue(targetTextNode, 'font-weight', computedStyle.fontWeight)
  }
}

const IGNORED_CSS_KEYWORDS = new Set(['initial', 'inherit', 'unset'])

function setAttributeIfValue(node: Element, attribute: string, value: string): void {
  if (!value || IGNORED_CSS_KEYWORDS.has(value)) {
    return
  }

  node.setAttribute(attribute, value)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to render the SVG export.'))
    image.src = src
  })
}

function triggerDownload(href: string, fileName: string): void {
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = fileName
  anchor.click()
}
