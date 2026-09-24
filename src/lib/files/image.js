// Preparación de fotos antes de guardarlas: recorte cuadrado, ~512×512 px y WebP de menos de
// ~150 KB. Validación de CV (PDF de hasta 5 MB).

export const PHOTO_SIZE = 512
export const PHOTO_MAX_BYTES = 150 * 1024
export const CV_MAX_BYTES = 5 * 1024 * 1024

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']

function extensionOf(name) {
  const match = /\.([a-z0-9]+)$/i.exec(name || '')
  return match ? match[1].toLowerCase() : ''
}

export function isHeic(file) {
  return /image\/hei[cf]/.test(file.type) || ['heic', 'heif'].includes(extensionOf(file.name))
}

// Mensaje de error o null si el archivo parece una foto admitida.
export function checkImageFile(file) {
  if (!file) return 'No se ha elegido ninguna foto.'
  const typeOk = IMAGE_TYPES.includes(file.type)
  const extOk = IMAGE_EXTENSIONS.includes(extensionOf(file.name))
  if (!typeOk && !(extOk && (!file.type || file.type === 'application/octet-stream'))) {
    return 'Formato no admitido. Usa una foto JPG, PNG, WebP o HEIC.'
  }
  return null
}

export function checkCvFile(file) {
  if (!file) return 'No se ha elegido ningún archivo.'
  if (file.type !== 'application/pdf' && extensionOf(file.name) !== 'pdf') return 'El CV tiene que ser un archivo PDF.'
  if (file.size > CV_MAX_BYTES) return 'El CV ocupa más de 5 MB. Redúcelo o guarda un enlace.'
  return null
}

// Recorte centrado: lado del cuadrado y desplazamiento en la imagen original.
export function squareCrop(width, height) {
  const side = Math.min(width, height)
  return { side, x: Math.round((width - side) / 2), y: Math.round((height - side) / 2) }
}

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Se intenta con <img> (algunos Safari abren HEIC así).
    }
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = url
    })
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * Convierte una foto en un cuadrado de PHOTO_SIZE px en WebP (JPEG si el navegador no sabe
 * generar WebP), bajando la calidad hasta que ocupe menos de PHOTO_MAX_BYTES.
 */
export async function prepareSquarePhoto(file) {
  const problem = checkImageFile(file)
  if (problem) throw new Error(problem)

  let image
  try {
    image = await decode(file)
  } catch {
    throw new Error(
      isHeic(file)
        ? 'Este navegador no puede abrir fotos HEIC. Pásala a JPG o PNG (en el iPhone: Ajustes → Cámara → Formatos → Más compatible) y vuelve a intentarlo.'
        : 'No se pudo leer la foto. Prueba con otra imagen.',
    )
  }

  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  const { side, x, y } = squareCrop(width, height)
  const size = Math.min(PHOTO_SIZE, side)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, x, y, side, side, 0, 0, size, size)
  image.close?.()

  let type = 'image/webp'
  let blob = null
  for (const quality of [0.85, 0.75, 0.65, 0.55, 0.45, 0.35]) {
    blob = await toBlob(canvas, type, quality)
    if (blob && blob.type !== 'image/webp') {
      type = 'image/jpeg'
      blob = await toBlob(canvas, type, quality)
    }
    if (blob && blob.size <= PHOTO_MAX_BYTES) break
  }
  if (!blob) throw new Error('No se pudo procesar la foto.')
  return blob
}

export function photoExtension(blob) {
  return blob.type === 'image/jpeg' ? 'jpg' : 'webp'
}
