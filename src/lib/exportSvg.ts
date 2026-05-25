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
  const { canvas, url } = await renderSvgToCanvas(svgElement)
  let downloadUrl: string | null = null

  try {
    const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.95)
    const pdfData = createPdfFromJpegDataUrl(jpegDataUrl, canvas.width, canvas.height)
    const pdfBlob = new Blob([pdfData], { type: 'application/pdf' })
    downloadUrl = URL.createObjectURL(pdfBlob)
    triggerDownload(downloadUrl, fileName)
  } finally {
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl)
    }
    URL.revokeObjectURL(url)
  }
}

async function renderSvgToCanvas(
  svgElement: SVGSVGElement,
): Promise<{ canvas: HTMLCanvasElement; url: string }> {
  const clonedSvg = svgElement.cloneNode(true) as SVGSVGElement
  inlineTextStyles(svgElement, clonedSvg)
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

    return { canvas, url }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
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

function createPdfFromJpegDataUrl(dataUrl: string, width: number, height: number): Uint8Array {
  const base64Data = dataUrl.split(',')[1]

  if (!base64Data) {
    throw new Error('Unable to encode chart image for PDF export.')
  }

  const jpegBinary = atob(base64Data)
  const jpegBytes = new Uint8Array(jpegBinary.length)

  for (let byteIndex = 0; byteIndex < jpegBinary.length; byteIndex += 1) {
    jpegBytes[byteIndex] = jpegBinary.charCodeAt(byteIndex)
  }

  const objects: Uint8Array[] = []
  const offsets: number[] = [0]
  const encoder = new TextEncoder()

  const pageWidth = Math.max(1, Math.round(width))
  const pageHeight = Math.max(1, Math.round(height))
  const imageObject = encoder.encode(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pageWidth} /Height ${pageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`,
  )
  const imageObjectEnd = encoder.encode('\nendstream\nendobj\n')
  const contentStream = encoder.encode(`q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`)
  const contentObject = encoder.encode(`5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n`)
  const contentObjectEnd = encoder.encode('endstream\nendobj\n')

  objects.push(encoder.encode('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'))
  objects.push(encoder.encode('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n'))
  objects.push(
    encoder.encode(
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
    ),
  )
  objects.push(concatUint8Arrays([imageObject, jpegBytes, imageObjectEnd]))
  objects.push(concatUint8Arrays([contentObject, contentStream, contentObjectEnd]))

  let currentOffset = encoder.encode('%PDF-1.4\n').length
  for (const objectData of objects) {
    offsets.push(currentOffset)
    currentOffset += objectData.length
  }

  const xrefStart = currentOffset
  const xrefHeader = encoder.encode(`xref\n0 ${objects.length + 1}\n`)
  const xrefRows = offsets
    .map((offset, index) =>
      index === 0 ? '0000000000 65535 f \n' : `${offset.toString().padStart(10, '0')} 00000 n \n`,
    )
    .join('')
  const xrefData = encoder.encode(xrefRows)
  const trailer = encoder.encode(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`,
  )

  return concatUint8Arrays([encoder.encode('%PDF-1.4\n'), ...objects, xrefHeader, xrefData, trailer])
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const output = new Uint8Array(totalLength)
  let offset = 0

  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.length
  }

  return output
}
