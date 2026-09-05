import 'dotenv/config'
import mysql from 'mysql2/promise'

const connectionOptions = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
}

const databaseName = process.env.DB_NAME || 'lista_precios'
const pool = mysql.createPool({ ...connectionOptions, database: databaseName })

export async function initializeDatabase() {
  const adminPool = mysql.createPool(connectionOptions)
  const safeDatabaseName = databaseName.replace(/[^a-zA-Z0-9_]/g, '')

  try {
    await adminPool.query(
      `CREATE DATABASE IF NOT EXISTS \`${safeDatabaseName}\`
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    )
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        nombre VARCHAR(160) NOT NULL,
        descripcion TEXT NULL,
        precio DECIMAL(12, 2) NOT NULL,
        tipo VARCHAR(80) NOT NULL,
        image_data MEDIUMBLOB NULL,
        image_mime_type VARCHAR(100) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_products_tipo (tipo)
      )
    `)
  } finally {
    await adminPool.end()
  }
}

export default pool
