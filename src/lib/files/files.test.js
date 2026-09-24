import { describe, expect, it } from 'vitest'
import { checkCvFile, checkImageFile, isHeic, squareCrop } from './image'
import { fileKey, sameFile } from './files'
import { contactFileRefs } from './contactFiles'

const file = (name, type, size = 1000) => ({ name, type, size })

describe('fotos', () => {
  it('acepta JPG, PNG, WebP y HEIC y rechaza el resto con un mensaje claro', () => {
    expect(checkImageFile(file('a.jpg', 'image/jpeg'))).toBeNull()
    expect(checkImageFile(file('a.png', 'image/png'))).toBeNull()
    expect(checkImageFile(file('a.webp', 'image/webp'))).toBeNull()
    expect(checkImageFile(file('IMG_1.HEIC', 'image/heic'))).toBeNull()
    // Algunos navegadores no dan tipo a los HEIC
    expect(checkImageFile(file('IMG_1.heic', ''))).toBeNull()
    expect(checkImageFile(file('a.gif', 'image/gif'))).toBe('Formato no admitido. Usa una foto JPG, PNG, WebP o HEIC.')
    expect(checkImageFile(file('a.pdf', 'application/pdf'))).toMatch(/Formato no admitido/)
    expect(isHeic(file('IMG_1.heic', ''))).toBe(true)
    expect(isHeic(file('a.jpg', 'image/jpeg'))).toBe(false)
  })

  it('recorta un cuadrado centrado', () => {
    expect(squareCrop(4000, 3000)).toEqual({ side: 3000, x: 500, y: 0 })
    expect(squareCrop(1080, 1920)).toEqual({ side: 1080, x: 0, y: 420 })
    expect(squareCrop(512, 512)).toEqual({ side: 512, x: 0, y: 0 })
  })
})

describe('CV', () => {
  it('solo PDF de hasta 5 MB', () => {
    expect(checkCvFile(file('cv.pdf', 'application/pdf', 4 * 1024 * 1024))).toBeNull()
    expect(checkCvFile(file('cv.docx', 'application/msword'))).toBe('El CV tiene que ser un archivo PDF.')
    expect(checkCvFile(file('cv.pdf', 'application/pdf', 6 * 1024 * 1024))).toMatch(/más de 5 MB/)
  })
})

describe('referencias de archivos', () => {
  it('identifican el archivo en la nube o en el dispositivo', () => {
    const cloud = { store: 'cloud', path: 'u1/photos/a.webp' }
    expect(fileKey(cloud)).toBe('cloud:u1/photos/a.webp')
    expect(fileKey({ store: 'device', id: 'x' })).toBe('device:x')
    expect(fileKey(null)).toBeNull()
    expect(sameFile(cloud, { ...cloud, size: 10 })).toBe(true)
    expect(sameFile(cloud, null)).toBe(false)
  })

  it('un contacto tiene su foto y, si es candidato, su CV (los enlaces no son archivos)', () => {
    const photo = { store: 'cloud', path: 'u1/photos/a.webp' }
    const cv = { store: 'device', id: 'cv1' }
    expect(contactFileRefs({ photo, candidacy: { cv } }).map((r) => r.folder)).toEqual(['photos', 'cvs'])
    expect(contactFileRefs({ candidacy: { cv: { url: 'https://example.com/cv' } } })).toEqual([])
    expect(contactFileRefs({})).toEqual([])
  })
})
