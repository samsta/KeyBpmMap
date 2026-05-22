export async function downloadSvgAsPng(
  svgElement: SVGSVGElement,
  fileName: string,
): Promise<void> {
  const clonedSvgElement = svgElement.cloneNode(true) as SVGSVGElement
  inlineTextStyles(svgElement, clonedSvgElement)
  const serializer = new XMLSerializer()
  const source = serializer.serializeToString(clonedSvgElement)
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

  targetTextNodes.forEach((targetTextNode, index) => {
    const sourceTextNode = sourceTextNodes[index]
    if (!sourceTextNode) {
      return
    }

    const computedStyle = getComputedStyle(sourceTextNode)
    setAttributeIfValue(targetTextNode, 'fill', computedStyle.fill)
    setAttributeIfValue(targetTextNode, 'font-family', computedStyle.fontFamily)
    setAttributeIfValue(targetTextNode, 'font-size', computedStyle.fontSize)
    setAttributeIfValue(targetTextNode, 'font-weight', computedStyle.fontWeight)
  })
}

function setAttributeIfValue(node: Element, attribute: string, value: string): void {
  if (!value || value === 'initial' || value === 'inherit' || value === 'unset') {
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
