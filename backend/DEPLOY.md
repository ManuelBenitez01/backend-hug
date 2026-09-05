# Despliegue en Hostinger VPS

## Backend

1. Instalar Node.js LTS y MySQL/MariaDB en el VPS.
2. Subir únicamente la carpeta `backend`.
3. Ejecutar `npm install --omit=dev`.
4. Copiar `.env.example` a `.env`.
5. Cambiar estas variables en `.env`:
   - `DB_USER` y `DB_PASSWORD`: usuario de MySQL del VPS.
   - `CORS_ORIGIN`: dominio exacto del frontend, incluyendo `https://`.
   - `SESSION_COOKIE_SAMESITE=none` si el frontend y la API están en dominios distintos, por ejemplo Netlify y Hostinger.
   - `JWT_SECRET`: una clave larga y aleatoria.
6. Ejecutar `npm start`.

La API crea automáticamente la base `lista_precios` y la tabla `products` al iniciar. No hay que subir ni importar `schema.sql`.

Para producción se recomienda ejecutar el backend con PM2:

```bash
npm install -g pm2
pm2 start server.js --name lista-precios-api
pm2 save
pm2 startup
```

## Frontend

1. En la raíz del frontend, crear `.env` desde `.env.example`.
2. Cambiar una sola línea:

```env
VITE_API_URL=https://api.tu-dominio.com
```

3. Ejecutar `npm install` y `npm run build`.
4. Subir el contenido de `dist` al dominio del frontend.

El backend debe estar detrás de HTTPS y `CORS_ORIGIN` debe coincidir exactamente con el dominio publicado.
