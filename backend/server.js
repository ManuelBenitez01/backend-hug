import 'dotenv/config'
import bcrypt from 'bcryptjs'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import express from 'express'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import pool, { initializeDatabase } from './db.js'

const app = express()
const port = Number(process.env.PORT || 3000)
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map(origin => origin.trim())
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    callback(null, file.mimetype.startsWith('image/'))
  },
})

app.use(cors({ origin: allowedOrigins, credentials: true }))
app.use(express.json())
app.use(cookieParser())

const productFields = 'id, nombre, descripcion, precio, tipo, image_mime_type AS imageMimeType'
const jwtSecret = process.env.JWT_SECRET || 'cambia-esta-clave-en-produccion'
const cookieSameSite = process.env.SESSION_COOKIE_SAMESITE || 'lax'

function signAdminToken(username) {
  return jwt.sign({ username, role: 'admin' }, jwtSecret, { expiresIn: '8h' })
}

function requireAdmin(request, response, next) {
  try {
    const token = request.cookies.admin_token
    request.admin = jwt.verify(token, jwtSecret)
    next()
  } catch (error) {
    response.status(401).json({ error: 'No autorizado' })
  }
}

function productWithImageUrl(product) {
  return {
    ...product,
    precio: Number(product.precio),
    imagen: product.imageMimeType ? `/api/products/${product.id}/image` : null,
  }
}

function validateProduct(body) {
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : ''
  const descripcion = typeof body.descripcion === 'string' ? body.descripcion.trim() : ''
  const tipo = typeof body.tipo === 'string' ? body.tipo.trim() : ''
  const precio = Number(body.precio)

  if (!nombre || !tipo || !Number.isFinite(precio) || precio < 0) {
    return null
  }

  return { nombre, descripcion, tipo, precio }
}

app.post('/api/auth/login', async (request, response, next) => {
  try {
    const { username, password } = request.body
    const validUser = username === process.env.ADMIN_USERNAME
    const validPassword = validUser && await bcrypt.compare(password || '', process.env.ADMIN_PASSWORD_HASH || '')

    if (!validPassword) {
      return response.status(401).json({ error: 'Usuario o contraseña incorrectos' })
    }

    response.cookie('admin_token', signAdminToken(username), {
      httpOnly: true,
      sameSite: cookieSameSite,
      secure: process.env.NODE_ENV === 'production' || cookieSameSite === 'none',
      maxAge: 8 * 60 * 60 * 1000,
    })
    response.json({ username })
  } catch (error) {
    next(error)
  }
})

app.post('/api/auth/logout', (_request, response) => {
  response.clearCookie('admin_token')
  response.status(204).send()
})

app.get('/api/auth/me', requireAdmin, (request, response) => {
  response.json({ username: request.admin.username })
})

app.get('/api/health', async (_request, response) => {
  try {
    await pool.query('SELECT 1')
    response.json({ ok: true, database: 'connected' })
  } catch (error) {
    response.status(503).json({ ok: false, database: 'disconnected' })
  }
})

app.get('/api/products', async (_request, response, next) => {
  try {
    const [products] = await pool.query(`SELECT ${productFields} FROM products ORDER BY id DESC`)
    response.json(products.map(productWithImageUrl))
  } catch (error) {
    next(error)
  }
})

app.get('/api/products/:id/image', async (request, response, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT image_data, image_mime_type FROM products WHERE id = ?',
      [request.params.id],
    )

    if (!rows[0]?.image_data) {
      return response.status(404).json({ error: 'El producto no tiene imagen' })
    }

    response.type(rows[0].image_mime_type)
    response.send(rows[0].image_data)
  } catch (error) {
    next(error)
  }
})

app.post('/api/products', requireAdmin, upload.single('imagen'), async (request, response, next) => {
  try {
    const product = validateProduct(request.body)
    if (!product) {
      return response.status(400).json({ error: 'nombre, precio y tipo son obligatorios' })
    }

    const [result] = await pool.query(
      `INSERT INTO products (nombre, descripcion, precio, tipo, image_data, image_mime_type)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [product.nombre, product.descripcion, product.precio, product.tipo, request.file?.buffer || null, request.file?.mimetype || null],
    )

    response.status(201).json({ id: result.insertId, ...product, imagen: request.file ? `/api/products/${result.insertId}/image` : null })
  } catch (error) {
    next(error)
  }
})

app.put('/api/products/:id', requireAdmin, upload.single('imagen'), async (request, response, next) => {
  try {
    const product = validateProduct(request.body)
    if (!product) {
      return response.status(400).json({ error: 'nombre, precio y tipo son obligatorios' })
    }

    const imageUpdate = request.file ? ', image_data = ?, image_mime_type = ?' : ''
    const values = request.file
      ? [product.nombre, product.descripcion, product.precio, product.tipo, request.file.buffer, request.file.mimetype, request.params.id]
      : [product.nombre, product.descripcion, product.precio, product.tipo, request.params.id]
    const [result] = await pool.query(
      `UPDATE products SET nombre = ?, descripcion = ?, precio = ?, tipo = ?${imageUpdate} WHERE id = ?`,
      values,
    )

    if (!result.affectedRows) {
      return response.status(404).json({ error: 'Producto no encontrado' })
    }

    response.json({ id: Number(request.params.id), ...product, imagen: `/api/products/${request.params.id}/image` })
  } catch (error) {
    next(error)
  }
})

app.delete('/api/products/:id', requireAdmin, async (request, response, next) => {
  try {
    const [result] = await pool.query('DELETE FROM products WHERE id = ?', [request.params.id])
    if (!result.affectedRows) {
      return response.status(404).json({ error: 'Producto no encontrado' })
    }

    response.status(204).send()
  } catch (error) {
    next(error)
  }
})

app.use((error, _request, response, _next) => {
  if (error instanceof multer.MulterError || error.message === 'Unexpected field') {
    return response.status(400).json({ error: 'La imagen debe ser válida y pesar menos de 5 MB' })
  }

  console.error(error)
  response.status(500).json({ error: 'Error interno del servidor' })
})

initializeDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`API escuchando en http://localhost:${port}`)
    })
  })
  .catch(error => {
    console.error('No se pudo inicializar la base de datos:', error.message)
    process.exitCode = 1
  })
