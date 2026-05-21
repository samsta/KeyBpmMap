export async function downloadSvgAsPng(
  svgElement: SVGSVGElement,
  fileName: string,
): Promise<void> {
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

    const downloadUrl = canvas.toDataURL('image/png')
    const anchor = document.createElement('a')
    anchor.href = downloadUrl
    anchor.download = fileName
    anchor.click()
  } finally {
    URL.revokeObjectURL(url)
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
